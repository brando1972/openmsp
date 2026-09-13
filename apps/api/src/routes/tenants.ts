import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { store, type DBOrg } from '../db/store.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import type { Tenant, CreateTenantRequest, WhiteLabelConfig } from '@openmsp/api-types';

const router = Router();
router.use(authenticate);

// Only the global admin (superadmin / owner) manages tenants.
router.use((req: AuthenticatedRequest, res, next) => {
  const role = req.user?.role;
  if (role !== 'superadmin' && role !== 'owner') {
    res.status(403).json({ error: 'Forbidden: global admin only' });
    return;
  }
  next();
});

function toTenant(org: DBOrg): Tenant {
  const devices = Array.from(store.devices.values()).filter((d) => (d as any).orgId === org.id);
  const users = Array.from(store.users.values()).filter((u) => u.orgId === org.id);
  // Count clients that have at least one device enrolled in this org
  const orgDeviceClientIds = new Set(devices.map((d) => d.clientId));
  const clientCount = orgDeviceClientIds.size;
  return {
    id: org.id,
    slug: org.slug,
    name: org.name,
    domain: org.domain,
    createdAt: org.createdAt,
    deviceCount: devices.length,
    clientCount,
    userCount: users.length
  };
}

// GET /api/v1/admin/tenants
router.get('/', (_req, res) => {
  res.json(Array.from(store.orgs.values()).map(toTenant));
});

// GET /api/v1/admin/tenants/:slug
router.get('/:slug', (req, res) => {
  const org = Array.from(store.orgs.values()).find((o) => o.slug === req.params.slug);
  if (!org) {
    res.status(404).json({ error: 'Tenant not found' });
    return;
  }
  res.json(toTenant(org));
});

// POST /api/v1/admin/tenants  { slug, name }
router.post('/', (req: AuthenticatedRequest, res) => {
  const { slug, name } = req.body as CreateTenantRequest;
  const cleanSlug = (slug || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(cleanSlug)) {
    res.status(400).json({ error: 'slug must be 2-31 chars: lowercase letters, digits, hyphens' });
    return;
  }
  if (['admin', 'api', 'www', 'app', 'mesh', 'vault'].includes(cleanSlug)) {
    res.status(400).json({ error: 'slug is reserved' });
    return;
  }
  if (Array.from(store.orgs.values()).some((o) => o.slug === cleanSlug)) {
    res.status(409).json({ error: 'slug already in use' });
    return;
  }

  const id = uuidv4();
  const settings: WhiteLabelConfig = {
    companyName: name || cleanSlug,
    logoUrl: '',
    primaryColor: '#0ea5e9',
    secondaryColor: '#0b1220',
    accentColor: '#22d3ee',
    darkMode: true,
    customDomain: `${cleanSlug}.apexmsp.app`,
    supportEmail: `support@apexmsp.app`,
    portalWelcomeMessage: `Welcome to ${name || cleanSlug}`
  };
  const org: DBOrg = { id, name: name || cleanSlug, slug: cleanSlug, domain: `${cleanSlug}.apexmsp.app`, settings, createdAt: new Date().toISOString() };
  store.orgs.set(id, org);

  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'tenant.create',
    targetType: 'tenant',
    targetId: cleanSlug,
    details: { slug: cleanSlug, name },
    ipAddress: req.ip
  });

  res.status(201).json(toTenant(org));
});

export default router;
