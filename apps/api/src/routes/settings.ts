import { Router } from 'express';
import { store } from '../db/store.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// GET /api/v1/org/settings
router.get('/', (req: AuthenticatedRequest, res) => {
  const org = store.orgs.get(req.user!.orgId) || Array.from(store.orgs.values())[0];
  res.json(org.settings);
});

// PATCH /api/v1/org/settings
router.patch('/', (req: AuthenticatedRequest, res) => {
  const org = store.orgs.get(req.user!.orgId) || Array.from(store.orgs.values())[0];
  const updates = req.body;

  org.settings = {
    ...org.settings,
    ...updates
  };
  store.orgs.set(org.id, org);

  store.recordAudit({
    orgId: org.id,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'org.settings_update',
    targetType: 'msp_org',
    targetId: org.id,
    details: updates,
    ipAddress: req.ip
  });

  res.json(org.settings);
});

export default router;
