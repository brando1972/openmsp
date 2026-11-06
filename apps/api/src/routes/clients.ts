import { Router, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../db/store.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import type { BillingLineItem, ClientContact, ClientOverview, ClientStatus, ClientTenant } from '@openmsp/api-types';
import {
  BillingError,
  DEFAULT_ORG_ID,
  PAYMENT_TERMS,
  auditDocument,
  createDocument,
  decorateContract,
  financialSummary,
  round2,
  unbilledTimeFor
} from '../billing/engine.js';

const router = Router();
router.use(authenticate);

// Live device count for a client: RMM-enrolled devices + relay/MDM tablets mapped to it.
function deviceCountForClient(id: string): number {
  let n = 0;
  for (const d of store.devices.values()) if (d.clientId === id) n++;
  for (const m of store.mdmClients.values()) if (m.clientId === id) n++;
  return n;
}

function openTicketsForClient(id: string): number {
  let n = 0;
  for (const t of store.tickets.values()) if (t.clientId === id && t.status !== 'resolved' && t.status !== 'closed') n++;
  return n;
}

const withLive = (c: ClientTenant): ClientTenant => ({
  ...c,
  totalDevices: deviceCountForClient(c.id),
  openTickets: openTicketsForClient(c.id)
});

const CLIENT_STATUSES: ClientStatus[] = ['active', 'prospect', 'inactive'];
const SLA_TIERS: ClientTenant['monthlySlaTier'][] = ['Gold 24/7', 'Silver 8/5', 'Bronze Best Effort'];

/** Validate + merge editable client profile fields from a request body. Throws a string on invalid input. */
function applyProfileFields(target: ClientTenant, b: Record<string, any>): void {
  const strFields = ['name', 'domain', 'contactName', 'contactEmail', 'contactPhone', 'activeContract', 'industry', 'website', 'notes', 'billingEmail', 'stripeCustomerId'] as const;
  for (const f of strFields) {
    if (b[f] === undefined) continue;
    const v = b[f] === null ? '' : String(b[f]).trim();
    if (f === 'name' && !v) throw 'Client name cannot be empty';
    if ((f === 'billingEmail' || f === 'contactEmail') && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw `${f} is not a valid email address`;
    (target as unknown as Record<string, unknown>)[f] = v || (['name', 'domain', 'contactName', 'contactEmail', 'contactPhone', 'activeContract'].includes(f) ? v : undefined);
  }
  if (b.sites !== undefined) {
    if (!Array.isArray(b.sites)) throw 'sites must be an array';
    target.sites = b.sites.map((s: unknown) => String(s)).filter(Boolean);
  }
  if (b.monthlySlaTier !== undefined) {
    if (!SLA_TIERS.includes(b.monthlySlaTier)) throw `monthlySlaTier must be one of ${SLA_TIERS.join(', ')}`;
    target.monthlySlaTier = b.monthlySlaTier;
  }
  if (b.status !== undefined) {
    if (!CLIENT_STATUSES.includes(b.status)) throw `status must be one of ${CLIENT_STATUSES.join(', ')}`;
    target.status = b.status;
  }
  if (b.paymentTerms !== undefined) {
    if (b.paymentTerms && !PAYMENT_TERMS.includes(b.paymentTerms)) throw 'invalid paymentTerms';
    target.paymentTerms = b.paymentTerms || undefined;
  }
  if (b.taxRateId !== undefined) {
    if (b.taxRateId && !store.taxRates.has(b.taxRateId)) throw 'taxRateId does not reference an existing tax rate';
    target.taxRateId = b.taxRateId || undefined;
  }
  if (b.taxExempt !== undefined) target.taxExempt = !!b.taxExempt;
  if (b.billableUsers !== undefined) {
    const n = Number(b.billableUsers);
    if (b.billableUsers !== null && (!Number.isFinite(n) || n < 0)) throw 'billableUsers must be a non-negative number';
    target.billableUsers = b.billableUsers === null ? undefined : Math.floor(n);
  }
  if (b.billingAddress !== undefined) {
    if (b.billingAddress !== null && typeof b.billingAddress !== 'object') throw 'billingAddress must be an object';
    target.billingAddress = b.billingAddress || undefined;
  }
  if (b.contacts !== undefined) {
    if (!Array.isArray(b.contacts)) throw 'contacts must be an array';
    target.contacts = b.contacts.map((c: Partial<ClientContact>, i: number): ClientContact => {
      if (!c || typeof c !== 'object' || !String(c.name || '').trim()) throw `contacts[${i}].name is required`;
      return {
        id: c.id || `ct-${uuidv4().substring(0, 8)}`,
        name: String(c.name).trim(),
        ...(c.email ? { email: String(c.email).trim() } : {}),
        ...(c.phone ? { phone: String(c.phone).trim() } : {}),
        ...(c.title ? { title: String(c.title).trim() } : {}),
        ...(c.isPrimary ? { isPrimary: true } : {}),
        ...(c.isBilling ? { isBilling: true } : {})
      };
    });
  }
}

// GET /api/v1/clients
router.get('/', (req: AuthenticatedRequest, res) => {
  const { clientId } = req.query;
  const allClients = Array.from(store.clients.values()).map(withLive);

  if (clientId && clientId !== 'all') {
    res.json(allClients.filter((c) => c.id === clientId));
    return;
  }

  res.json(allClients);
});

// GET /api/v1/clients/financials — must be registered before /:id
router.get('/financials', (_req, res) => {
  res.json(Array.from(store.clients.values()).map((c) => financialSummary(c.id)));
});

// GET /api/v1/clients/:id
router.get('/:id', (req, res) => {
  const client = store.clients.get(req.params.id as string);
  if (!client) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  res.json(withLive(client));
});

// GET /api/v1/clients/:id/overview — everything about a client in one call
router.get('/:id/overview', (req, res) => {
  const id = req.params.id as string;
  const client = store.clients.get(id);
  if (!client) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  const byDateDesc = <T extends { createdAt?: string }>(a: T, b: T) => (b.createdAt || '').localeCompare(a.createdAt || '');
  const overview: ClientOverview = {
    client: withLive(client),
    financial: financialSummary(id),
    devices: Array.from(store.devices.values()).filter((d) => d.clientId === id),
    mdmDevices: Array.from(store.mdmClients.entries())
      .filter(([, m]) => m.clientId === id)
      .map(([serial, m]) => ({ serial, ...(m.name ? { name: m.name } : {}), ...(m.model ? { model: m.model } : {}) })),
    unifiSites: Array.from(store.unifiSites.values()).filter((s) => s.clientId === id),
    vaultItems: Array.from(store.vaultItems.values())
      .filter((v) => v.clientId === id)
      .map((item) => ({ ...item, password: item.password ? '••••••••••••' : undefined })),
    tickets: Array.from(store.tickets.values()).filter((t) => t.clientId === id).sort(byDateDesc),
    unbilledTime: unbilledTimeFor(id),
    incidents: Array.from(store.securityIncidents.values()).filter((i) => i.clientId === id),
    contracts: Array.from(store.contracts.values()).filter((c) => c.clientId === id).map(decorateContract),
    documents: Array.from(store.billingDocuments.values())
      .filter((d) => d.clientId === id)
      .sort((a, b) => (b.issueDate === a.issueDate ? b.createdAt.localeCompare(a.createdAt) : b.issueDate.localeCompare(a.issueDate))),
    payments: Array.from(store.billingPayments.values())
      .filter((p) => p.clientId === id)
      .sort((a, b) => b.date.localeCompare(a.date))
  };
  res.json(overview);
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
    status: 'active',
    createdAt: new Date().toISOString()
  };

  // Optional billing/profile fields (status, contacts, billingEmail, billingAddress, paymentTerms, taxRateId, ...)
  try {
    applyProfileFields(newClient, req.body || {});
  } catch (msg) {
    res.status(400).json({ error: String(msg) });
    return;
  }
  newClient.name = String(newClient.name).trim() || trimmedName;
  if (!newClient.sites.length) newClient.sites = ['Main Office'];

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

  res.status(201).json(withLive(newClient));
});

// PUT /api/v1/clients/:id — update profile / billing settings
const updateClient = (req: AuthenticatedRequest, res: Response) => {
  const id = req.params.id as string;
  const client = store.clients.get(id);
  if (!client) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  const draft: ClientTenant = { ...client };
  try {
    applyProfileFields(draft, req.body || {});
  } catch (msg) {
    res.status(400).json({ error: String(msg) });
    return;
  }
  draft.updatedAt = new Date().toISOString();
  store.clients.set(id, draft);

  // Keep denormalized names in sync on open records.
  if (draft.name !== client.name) {
    for (const c of store.contracts.values()) if (c.clientId === id) c.clientName = draft.name;
    for (const d of store.billingDocuments.values()) {
      if (d.clientId === id && (d.status === 'draft' || d.status === 'pending_review')) d.clientName = draft.name;
    }
  }

  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'client.update',
    targetType: 'client',
    targetId: id,
    details: { fields: Object.keys(req.body || {}) },
    ipAddress: req.ip
  });
  store.persist();
  res.json(withLive(draft));
};
router.put('/:id', updateClient);
router.patch('/:id', updateClient); // legacy PATCH used by the quick Create/Edit client modal

// DELETE /api/v1/clients/:id — soft archive (status → inactive)
router.delete('/:id', (req: AuthenticatedRequest, res) => {
  const id = req.params.id as string;
  const client = store.clients.get(id);
  if (!client) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  client.status = 'inactive';
  client.updatedAt = new Date().toISOString();
  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'client.archive',
    targetType: 'client',
    targetId: id,
    details: { name: client.name },
    ipAddress: req.ip
  });
  res.json(withLive(client));
});

// POST /api/v1/clients/:id/invoice-time — draft invoice from unbilled billable ticket time
router.post('/:id/invoice-time', (req: AuthenticatedRequest, res) => {
  const id = req.params.id as string;
  const client = store.clients.get(id);
  if (!client) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  const wanted: string[] | undefined = Array.isArray(req.body?.timeEntryIds) && req.body.timeEntryIds.length
    ? req.body.timeEntryIds.map(String)
    : undefined;
  const entries = unbilledTimeFor(id).filter((u) => !wanted || wanted.includes(u.entry.id));
  if (!entries.length) {
    res.status(400).json({ error: 'No unbilled billable time entries for this client' });
    return;
  }

  // One line per ticket + hourly rate.
  const groups = new Map<string, typeof entries>();
  for (const u of entries) {
    const key = `${u.ticketId}|${Number(u.entry.hourlyRate) || 0}`;
    groups.set(key, [...(groups.get(key) || []), u]);
  }
  const lines: Partial<BillingLineItem>[] = Array.from(groups.values()).map((g) => {
    const minutes = g.reduce((a, u) => a + (Number(u.entry.minutes) || 0), 0);
    const first = g[0];
    return {
      name: `Labor – ${first.ticketNumber} ${first.ticketTitle}`,
      description: g.map((u) => `${u.entry.date?.slice(0, 10) || ''} ${u.entry.technician}: ${u.entry.description} (${u.entry.minutes} min)`.trim()).join('\n'),
      quantity: round2(minutes / 60),
      unit: 'hr',
      unitPrice: Number(first.entry.hourlyRate) || 0,
      taxable: false,
      source: 'time_entry',
      sourceRef: { ticketId: first.ticketId, timeEntryIds: g.map((u) => u.entry.id) }
    };
  });

  try {
    const doc = createDocument(
      { type: 'invoice', clientId: id, subject: 'Professional services — ticket labor', lines: lines as BillingLineItem[] },
      req.user?.name || 'System',
      req.user?.orgId || DEFAULT_ORG_ID,
      `Created from ${entries.length} unbilled time entr${entries.length === 1 ? 'y' : 'ies'}`
    );
    doc.auditFlags = auditDocument(doc);
    store.recordAudit({
      orgId: req.user!.orgId,
      userId: req.user!.id,
      actorName: req.user!.name,
      action: 'billing.invoice_create_from_time',
      targetType: 'billing_document',
      targetId: doc.id,
      details: { number: doc.number, clientId: id, entries: entries.length, total: doc.total },
      ipAddress: req.ip
    });
    res.status(201).json(doc);
  } catch (e) {
    if (e instanceof BillingError) {
      res.status(e.status).json({ error: e.message });
      return;
    }
    throw e;
  }
});

export default router;
