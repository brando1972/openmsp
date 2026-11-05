import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../db/store.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import type { ClientTenant } from '@openmsp/api-types';

const router = Router();
router.use(authenticate);

// Live device count for a client: RMM-enrolled devices + relay/MDM tablets mapped to it.
function deviceCountForClient(id: string): number {
  let n = 0;
  for (const d of store.devices.values()) if (d.clientId === id) n++;
  for (const m of store.mdmClients.values()) if (m.clientId === id) n++;
  return n;
}

// GET /api/v1/clients
router.get('/', (req: AuthenticatedRequest, res) => {
  const { clientId } = req.query;
  const allClients = Array.from(store.clients.values()).map((c) => ({
    ...c,
    totalDevices: deviceCountForClient(c.id)
  }));

  if (clientId && clientId !== 'all') {
    res.json(allClients.filter((c) => c.id === clientId));
    return;
  }

  res.json(allClients);
});

// GET /api/v1/clients/:id
router.get('/:id', (req, res) => {
  const client = store.clients.get(req.params.id);
  if (!client) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  res.json(client);
});

// POST /api/v1/clients
router.post('/', (req: AuthenticatedRequest, res) => {
  const { name, domain, contactName, contactEmail, contactPhone, sites, activeContract, monthlySlaTier } = req.body;
  if (!name || !String(name).trim()) {
    res.status(400).json({ error: 'Client name is required' });
    return;
  }

  const trimmedName = String(name).trim();
  const slug = trimmedName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 24);
  const baseId = slug ? `c-${slug}` : `c-${uuidv4().substring(0, 8)}`;
  const id = store.clients.has(baseId) ? `${baseId}-${uuidv4().substring(0, 4)}` : baseId;

  const parsedSites = Array.isArray(sites) && sites.length > 0
    ? sites.map((s: unknown) => String(s).trim()).filter(Boolean)
    : ['Main Office'];

  const newClient: ClientTenant = {
    id,
    name: trimmedName,
    domain: domain ? String(domain).trim() : '',
    contactName: contactName ? String(contactName).trim() : '',
    contactEmail: contactEmail ? String(contactEmail).trim() : '',
    contactPhone: contactPhone ? String(contactPhone).trim() : '',
    sites: parsedSites.length > 0 ? parsedSites : ['Main Office'],
    activeContract: activeContract || 'Standard Managed Care',
    monthlySlaTier: monthlySlaTier || 'Gold 24/7',
    totalDevices: 0,
    openTickets: 0,
    createdAt: new Date().toISOString()
  };

  store.clients.set(id, newClient);

  // Pre-seed a long-lived default enrollment token for this client organization
  const defaultTokenStr = `tok-${slug || id.replace(/^c-/, '')}-${uuidv4().substring(0, 8)}`;
  store.enrollmentTokens.set(defaultTokenStr, {
    id: uuidv4(),
    token: defaultTokenStr,
    orgId: req.user?.orgId || '00000000-0000-0000-0000-000000000001',
    clientId: id,
    siteId: newClient.sites[0] || 'Main Office',
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    used: false,
    createdAt: new Date().toISOString()
  });

  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'client.create',
    targetType: 'client',
    targetId: id,
    details: { name: trimmedName, sites: newClient.sites },
    ipAddress: req.ip
  });

  store.persist();

  res.status(201).json(newClient);
});

// PATCH /api/v1/clients/:id
router.patch('/:id', (req: AuthenticatedRequest, res) => {
  const existing = store.clients.get(String(req.params.id));
  if (!existing) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }

  const { name, domain, contactName, contactEmail, contactPhone, sites, activeContract, monthlySlaTier } = req.body;
  const updated: ClientTenant = {
    ...existing,
    ...(name !== undefined ? { name: String(name).trim() } : {}),
    ...(domain !== undefined ? { domain: String(domain).trim() } : {}),
    ...(contactName !== undefined ? { contactName: String(contactName).trim() } : {}),
    ...(contactEmail !== undefined ? { contactEmail: String(contactEmail).trim() } : {}),
    ...(contactPhone !== undefined ? { contactPhone: String(contactPhone).trim() } : {}),
    ...(Array.isArray(sites) ? { sites: sites.map((s: unknown) => String(s).trim()).filter(Boolean) } : {}),
    ...(activeContract !== undefined ? { activeContract } : {}),
    ...(monthlySlaTier !== undefined ? { monthlySlaTier } : {}),
    totalDevices: deviceCountForClient(existing.id)
  };

  store.clients.set(existing.id, updated);
  store.persist();
  res.json(updated);
});

export default router;
