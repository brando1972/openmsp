import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { store } from '../db/store.js';
import { wsManager } from '../ws/manager.js';
import type {
  DispatchJob,
  DispatchJobStatus,
  DispatchJobEvent,
  JobMessage,
  TechLocation,
  ShiftState,
  DispatchTech,
  GeoPoint,
  UserRole
} from '@openmsp/api-types';

/**
 * Dispatch — mobile field-service control plane.
 *
 * A dispatcher (owner/admin) creates jobs, assigns them to techs, and watches
 * techs live on a map; a tech (role 'tech') works the jobs assigned to them,
 * advancing status (accepted → en_route → on_site → done), chatting per-job, and
 * reporting GPS while on-shift. Everything is org-scoped and broadcast over the
 * existing per-org WebSocket so both sides stay live.
 */

const router = Router();
router.use(authenticate);

const DISPATCHER_ROLES: UserRole[] = ['owner', 'admin'];
const isDispatcher = (role: UserRole) => DISPATCHER_ROLES.includes(role);

const VALID_STATUS: DispatchJobStatus[] = ['unassigned', 'assigned', 'accepted', 'en_route', 'on_site', 'done', 'cancelled'];

function sanitizeGeo(g: any): GeoPoint | undefined {
  if (!g || typeof g.lat !== 'number' || typeof g.lng !== 'number') return undefined;
  if (!Number.isFinite(g.lat) || !Number.isFinite(g.lng)) return undefined;
  return {
    lat: g.lat, lng: g.lng,
    accuracy: Number.isFinite(g.accuracy) ? g.accuracy : undefined,
    at: new Date().toISOString()
  };
}

// A tech may see a job only if it's assigned to them; a dispatcher sees all org jobs.
function canSeeJob(req: AuthenticatedRequest, job: DispatchJob): boolean {
  if (job.orgId !== req.user!.orgId) return false;
  if (isDispatcher(req.user!.role)) return true;
  return job.assignedTechId === req.user!.id;
}

function messagesForJob(jobId: string): JobMessage[] {
  return [...store.jobMessages.values()]
    .filter((m) => m.jobId === jobId)
    .sort((a, b) => a.at.localeCompare(b.at));
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

// GET /api/v1/dispatch/jobs?status=&mine=1&active=1
router.get('/jobs', (req: AuthenticatedRequest, res) => {
  const orgId = req.user!.orgId;
  const dispatcher = isDispatcher(req.user!.role);
  const statusFilter = typeof req.query.status === 'string' ? req.query.status : '';
  const activeOnly = req.query.active === '1';

  let jobs = [...store.dispatchJobs.values()].filter((j) => j.orgId === orgId);
  if (!dispatcher) jobs = jobs.filter((j) => j.assignedTechId === req.user!.id);
  if (statusFilter) jobs = jobs.filter((j) => j.status === statusFilter);
  if (activeOnly) jobs = jobs.filter((j) => j.status !== 'done' && j.status !== 'cancelled');

  jobs.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  res.json({ jobs });
});

// POST /api/v1/dispatch/jobs  (dispatcher only)
router.post('/jobs', (req: AuthenticatedRequest, res) => {
  if (!isDispatcher(req.user!.role)) { res.status(403).json({ error: 'Only dispatchers can create jobs' }); return; }
  const b = req.body || {};
  if (!b.title || !b.customerName || !b.address) {
    res.status(400).json({ error: 'title, customerName and address are required' });
    return;
  }
  const now = new Date().toISOString();
  const assignedTech = b.assignedTechId ? store.users.get(b.assignedTechId) : undefined;
  const client = b.clientId ? store.clients.get(b.clientId) : undefined;

  const job: DispatchJob = {
    id: `dj-${uuidv4().slice(0, 8)}`,
    orgId: req.user!.orgId,
    jobNumber: store.nextJobNumber(),
    title: String(b.title),
    description: String(b.description || ''),
    clientId: b.clientId || undefined,
    clientName: client?.name,
    customerName: String(b.customerName),
    address: String(b.address),
    location: sanitizeGeo(b.location),
    priority: ['low', 'normal', 'high', 'urgent'].includes(b.priority) ? b.priority : 'normal',
    status: assignedTech ? 'assigned' : 'unassigned',
    assignedTechId: assignedTech?.id,
    assignedTechName: assignedTech?.fullName,
    scheduledStart: b.scheduledStart || undefined,
    scheduledEnd: b.scheduledEnd || undefined,
    events: [{ status: assignedTech ? 'assigned' : 'unassigned', at: now, byId: req.user!.id, byName: req.user!.name }],
    createdBy: req.user!.id,
    createdByName: req.user!.name,
    createdAt: now,
    updatedAt: now
  };
  store.dispatchJobs.set(job.id, job);
  store.recordAudit({
    orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name,
    action: 'dispatch.create_job', targetType: 'job', targetId: job.id,
    details: { jobNumber: job.jobNumber, assignedTechId: job.assignedTechId }, ipAddress: req.ip
  });
  wsManager.broadcastToOrg(req.user!.orgId, 'dispatch.job', job);
  res.status(201).json({ job });
});

// GET /api/v1/dispatch/jobs/:id
router.get('/jobs/:id', (req: AuthenticatedRequest, res) => {
  const job = store.dispatchJobs.get(String(req.params.id));
  if (!job || !canSeeJob(req, job)) { res.status(404).json({ error: 'Job not found' }); return; }
  res.json({ job, messages: messagesForJob(job.id) });
});

// PATCH /api/v1/dispatch/jobs/:id/status  { status, location?, note? }
router.patch('/jobs/:id/status', (req: AuthenticatedRequest, res) => {
  const job = store.dispatchJobs.get(String(req.params.id));
  if (!job || !canSeeJob(req, job)) { res.status(404).json({ error: 'Job not found' }); return; }
  const next = req.body?.status as DispatchJobStatus;
  if (!VALID_STATUS.includes(next)) { res.status(400).json({ error: 'invalid status' }); return; }
  // Only a dispatcher may unassign/cancel/assign via this route; techs drive the field states.
  if (!isDispatcher(req.user!.role) && ['unassigned', 'assigned', 'cancelled'].includes(next)) {
    res.status(403).json({ error: 'Not permitted for your role' });
    return;
  }
  const now = new Date().toISOString();
  const evt: DispatchJobEvent = {
    status: next, at: now, byId: req.user!.id, byName: req.user!.name,
    location: sanitizeGeo(req.body?.location), note: req.body?.note ? String(req.body.note) : undefined
  };
  job.status = next;
  job.events.push(evt);
  job.updatedAt = now;
  store.dispatchJobs.set(job.id, job);
  wsManager.broadcastToOrg(req.user!.orgId, 'dispatch.job', job);
  res.json({ job });
});

// POST /api/v1/dispatch/jobs/:id/assign  { assignedTechId }  (dispatcher only)
router.post('/jobs/:id/assign', (req: AuthenticatedRequest, res) => {
  if (!isDispatcher(req.user!.role)) { res.status(403).json({ error: 'Only dispatchers can assign' }); return; }
  const job = store.dispatchJobs.get(String(req.params.id));
  if (!job || job.orgId !== req.user!.orgId) { res.status(404).json({ error: 'Job not found' }); return; }
  const tech = store.users.get(String(req.body?.assignedTechId || ''));
  if (!tech || tech.orgId !== req.user!.orgId) { res.status(400).json({ error: 'Unknown tech' }); return; }
  const now = new Date().toISOString();
  job.assignedTechId = tech.id;
  job.assignedTechName = tech.fullName;
  if (job.status === 'unassigned' || job.status === 'cancelled') job.status = 'assigned';
  job.events.push({ status: 'assigned', at: now, byId: req.user!.id, byName: req.user!.name, note: `Assigned to ${tech.fullName}` });
  job.updatedAt = now;
  store.dispatchJobs.set(job.id, job);
  wsManager.broadcastToOrg(req.user!.orgId, 'dispatch.job', job);
  res.json({ job });
});

// ---------------------------------------------------------------------------
// Per-job messaging
// ---------------------------------------------------------------------------

// GET /api/v1/dispatch/jobs/:id/messages
router.get('/jobs/:id/messages', (req: AuthenticatedRequest, res) => {
  const job = store.dispatchJobs.get(String(req.params.id));
  if (!job || !canSeeJob(req, job)) { res.status(404).json({ error: 'Job not found' }); return; }
  res.json({ messages: messagesForJob(job.id) });
});

// POST /api/v1/dispatch/jobs/:id/messages  { body }
router.post('/jobs/:id/messages', (req: AuthenticatedRequest, res) => {
  const job = store.dispatchJobs.get(String(req.params.id));
  if (!job || !canSeeJob(req, job)) { res.status(404).json({ error: 'Job not found' }); return; }
  const body = String(req.body?.body || '').trim();
  if (!body) { res.status(400).json({ error: 'body required' }); return; }
  const msg: JobMessage = {
    id: `jm-${uuidv4().slice(0, 8)}`,
    jobId: job.id,
    orgId: job.orgId,
    senderId: req.user!.id,
    senderName: req.user!.name,
    senderRole: req.user!.role,
    body: body.slice(0, 4000),
    at: new Date().toISOString()
  };
  store.jobMessages.set(msg.id, msg);
  job.updatedAt = msg.at;
  wsManager.broadcastToOrg(job.orgId, 'dispatch.message', msg);
  res.status(201).json({ message: msg });
});

// ---------------------------------------------------------------------------
// Shift + GPS
// ---------------------------------------------------------------------------

// POST /api/v1/dispatch/shift  { on: boolean }
router.post('/shift', (req: AuthenticatedRequest, res) => {
  const on = !!req.body?.on;
  const shift: ShiftState = {
    userId: req.user!.id, userName: req.user!.name, onShift: on,
    since: on ? new Date().toISOString() : undefined
  };
  store.techShifts.set(req.user!.id, shift);
  const loc = store.techLocations.get(req.user!.id);
  if (loc) { loc.onShift = on; store.techLocations.set(req.user!.id, loc); }
  wsManager.broadcastToOrg(req.user!.orgId, 'dispatch.shift', shift);
  res.json({ shift });
});

// GET /api/v1/dispatch/shift — the caller's own shift state
router.get('/shift', (req: AuthenticatedRequest, res) => {
  res.json({ shift: store.techShifts.get(req.user!.id) || { userId: req.user!.id, userName: req.user!.name, onShift: false } });
});

// POST /api/v1/dispatch/location  { lat, lng, accuracy?, heading?, speedMps? }
// A tech reports position; only accepted while on-shift.
router.post('/location', (req: AuthenticatedRequest, res) => {
  const b = req.body || {};
  if (typeof b.lat !== 'number' || typeof b.lng !== 'number' || !Number.isFinite(b.lat) || !Number.isFinite(b.lng)) {
    res.status(400).json({ error: 'lat and lng required' });
    return;
  }
  const shift = store.techShifts.get(req.user!.id);
  const onShift = !!shift?.onShift;
  const loc: TechLocation = {
    userId: req.user!.id,
    userName: req.user!.name,
    lat: b.lat, lng: b.lng,
    accuracy: Number.isFinite(b.accuracy) ? b.accuracy : undefined,
    heading: Number.isFinite(b.heading) ? b.heading : undefined,
    speedMps: Number.isFinite(b.speedMps) ? b.speedMps : undefined,
    onShift,
    updatedAt: new Date().toISOString()
  };
  store.techLocations.set(req.user!.id, loc);
  // Broadcast for the dispatcher live map (the tech clients ignore it).
  wsManager.broadcastToOrg(req.user!.orgId, 'dispatch.location', loc);
  res.json({ ok: true });
});

// GET /api/v1/dispatch/locations — dispatcher live map (all techs' last fix)
router.get('/locations', (req: AuthenticatedRequest, res) => {
  if (!isDispatcher(req.user!.role)) { res.status(403).json({ error: 'Dispatchers only' }); return; }
  const orgUserIds = new Set([...store.users.values()].filter((u) => u.orgId === req.user!.orgId).map((u) => u.id));
  const locations = [...store.techLocations.values()].filter((l) => orgUserIds.has(l.userId));
  res.json({ locations });
});

// ---------------------------------------------------------------------------
// Techs (dispatcher: roster with shift + location + open job counts)
// ---------------------------------------------------------------------------
router.get('/techs', (req: AuthenticatedRequest, res) => {
  if (!isDispatcher(req.user!.role)) { res.status(403).json({ error: 'Dispatchers only' }); return; }
  const orgId = req.user!.orgId;
  const openByTech = new Map<string, number>();
  for (const j of store.dispatchJobs.values()) {
    if (j.orgId === orgId && j.assignedTechId && j.status !== 'done' && j.status !== 'cancelled') {
      openByTech.set(j.assignedTechId, (openByTech.get(j.assignedTechId) || 0) + 1);
    }
  }
  const techs: DispatchTech[] = [...store.users.values()]
    .filter((u) => u.orgId === orgId && (u.role === 'tech' || u.role === 'admin' || u.role === 'owner'))
    .map((u) => ({
      id: u.id, name: u.fullName, email: u.email, role: u.role,
      onShift: !!store.techShifts.get(u.id)?.onShift,
      location: store.techLocations.get(u.id),
      openJobs: openByTech.get(u.id) || 0
    }));
  res.json({ techs });
});

export default router;
