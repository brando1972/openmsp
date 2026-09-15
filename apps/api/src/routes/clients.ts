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
  if (!name) {
    res.status(400).json({ error: 'Client name is required' });
    return;
  }

  const id = `c-${uuidv4().substring(0, 8)}`;
  const newClient: ClientTenant = {
    id,
    name,
    domain: domain || '',
    contactName: contactName || '',
    contactEmail: contactEmail || '',
    contactPhone: contactPhone || '',
    sites: Array.isArray(sites) ? sites : ['Default Site'],
    activeContract: activeContract || 'Standard Managed Care',
    monthlySlaTier: monthlySlaTier || 'Silver 8/5',
    totalDevices: 0,
    openTickets: 0,
    createdAt: new Date().toISOString()
  };

  store.clients.set(id, newClient);

  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'client.create',
    targetType: 'client',
    targetId: id,
    details: { name },
    ipAddress: req.ip
  });

  res.status(201).json(newClient);
});

export default router;
