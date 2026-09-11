import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../db/store.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { wsManager } from '../ws/manager.js';
import type { PSATicket, TicketComment, TimeEntry } from '@openmsp/api-types';

const router = Router();
router.use(authenticate);

// GET /api/v1/tickets
router.get('/', (req: AuthenticatedRequest, res) => {
  const { clientId } = req.query;
  let allTickets = Array.from(store.tickets.values());

  if (clientId && clientId !== 'all') {
    allTickets = allTickets.filter((t) => t.clientId === clientId);
  }

  res.json(allTickets);
});

// GET /api/v1/tickets/:id
router.get('/:id', (req, res) => {
  const ticket = store.tickets.get(req.params.id as string);
  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found' });
    return;
  }
  res.json(ticket);
});

// POST /api/v1/tickets
router.post('/', (req: AuthenticatedRequest, res) => {
  const { title, description, clientId, deviceId, priority, category, assignedTech } = req.body;
  if (!title || !clientId) {
    res.status(400).json({ error: 'Title and clientId are required' });
    return;
  }

  const client = store.clients.get(clientId);
  const clientName = client ? client.name : 'Unknown Client';
  const device = deviceId ? store.devices.get(deviceId) : undefined;

  const ticketNumber = `TICK-${1000 + store.tickets.size + 1}`;
  const id = `tick-${uuidv4().substring(0, 8)}`;

  // SLA calculation based on priority
  let slaHours = 24;
  if (priority === 'urgent') slaHours = 2;
  else if (priority === 'high') slaHours = 8;
  else if (priority === 'low') slaHours = 48;

  const newTicket: PSATicket = {
    id,
    ticketNumber,
    title,
    description: description || '',
    clientId,
    clientName,
    deviceId: device ? device.id : undefined,
    deviceName: device ? device.name : undefined,
    priority: priority || 'medium',
    status: 'new',
    category: category || 'Software',
    assignedTech: assignedTech || req.user!.name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    slaDueDate: new Date(Date.now() + slaHours * 3600 * 1000).toISOString(),
    slaBreached: false,
    comments: [],
    timeEntries: []
  };

  store.tickets.set(id, newTicket);

  if (client) {
    client.openTickets += 1;
    store.clients.set(client.id, client);
  }

  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'ticket.create',
    targetType: 'ticket',
    targetId: id,
    details: { ticketNumber, title, priority },
    ipAddress: req.ip
  });

  wsManager.broadcastToOrg(req.user!.orgId, 'ticket.updated', {
    ticketId: id,
    ticketNumber,
    status: newTicket.status,
    assignedTech: newTicket.assignedTech,
    updatedAt: newTicket.updatedAt
  });

  res.status(201).json(newTicket);
});

// PATCH /api/v1/tickets/:id
router.patch('/:id', (req: AuthenticatedRequest, res) => {
  const ticket = store.tickets.get(req.params.id as string);
  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found' });
    return;
  }

  const { status, priority, assignedTech, category } = req.body;
  if (status !== undefined) ticket.status = status;
  if (priority !== undefined) ticket.priority = priority;
  if (assignedTech !== undefined) ticket.assignedTech = assignedTech;
  if (category !== undefined) ticket.category = category;

  ticket.updatedAt = new Date().toISOString();
  store.tickets.set(ticket.id, ticket);

  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'ticket.update',
    targetType: 'ticket',
    targetId: ticket.id,
    details: req.body,
    ipAddress: req.ip
  });

  wsManager.broadcastToOrg(req.user!.orgId, 'ticket.updated', {
    ticketId: ticket.id,
    ticketNumber: ticket.ticketNumber,
    status: ticket.status,
    assignedTech: ticket.assignedTech,
    updatedAt: ticket.updatedAt
  });

  res.json(ticket);
});

// POST /api/v1/tickets/:id/comments
router.post('/:id/comments', (req: AuthenticatedRequest, res) => {
  const ticket = store.tickets.get(req.params.id as string);
  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found' });
    return;
  }

  const { content, isInternal, authorRole } = req.body;
  if (!content) {
    res.status(400).json({ error: 'Comment content is required' });
    return;
  }

  const comment: TicketComment = {
    id: uuidv4(),
    author: req.user!.name,
    authorRole: authorRole || 'tech',
    content,
    isInternal: isInternal === true,
    timestamp: new Date().toISOString()
  };

  ticket.comments.push(comment);
  ticket.updatedAt = new Date().toISOString();
  store.tickets.set(ticket.id, ticket);

  wsManager.broadcastToOrg(req.user!.orgId, 'ticket.updated', {
    ticketId: ticket.id,
    ticketNumber: ticket.ticketNumber,
    status: ticket.status,
    assignedTech: ticket.assignedTech,
    updatedAt: ticket.updatedAt
  });

  res.status(201).json(comment);
});

// POST /api/v1/tickets/:id/time
router.post('/:id/time', (req: AuthenticatedRequest, res) => {
  const ticket = store.tickets.get(req.params.id as string);
  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found' });
    return;
  }

  const { minutes, description, billable, hourlyRate } = req.body;
  if (!minutes) {
    res.status(400).json({ error: 'Minutes are required' });
    return;
  }

  const entry: TimeEntry = {
    id: uuidv4(),
    technician: req.user!.name,
    minutes: Number(minutes),
    description: description || 'Support & remediation work',
    date: new Date().toISOString().split('T')[0],
    billable: billable !== false,
    hourlyRate: hourlyRate || 150
  };

  ticket.timeEntries.push(entry);
  ticket.updatedAt = new Date().toISOString();
  store.tickets.set(ticket.id, ticket);

  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'ticket.time_entry',
    targetType: 'ticket',
    targetId: ticket.id,
    details: { minutes, billable },
    ipAddress: req.ip
  });

  res.status(201).json(entry);
});

export default router;
