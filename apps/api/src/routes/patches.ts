import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../db/store.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import type { DeviceCommand, ManagedDevice } from '@openmsp/api-types';

const router = Router();
router.use(authenticate);

// GET /api/v1/patches
router.get('/', (req, res) => {
  res.json(Array.from(store.patches.values()));
});

// POST /api/v1/patches/:id/approve
// Spec: "approvePatch sets approved=true (never toggles)."
router.post('/:id/approve', (req: AuthenticatedRequest, res) => {
  const patch = store.patches.get(req.params.id as string);
  if (!patch) {
    res.status(404).json({ error: 'Patch not found' });
    return;
  }

  patch.approved = true;
  store.patches.set(patch.id, patch);

  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'patch.approve',
    targetType: 'patch',
    targetId: patch.id,
    details: { kbArticle: patch.kbArticle, title: patch.title },
    ipAddress: req.ip
  });

  res.json({ success: true, patch });
});

// POST /api/v1/patches/deploy
// Spec: "Deploy = agent command install_approved_patches"
router.post('/deploy', (req: AuthenticatedRequest, res) => {
  const { patchId, deviceIds } = req.body;
  const approvedPatches = Array.from(store.patches.values()).filter((p) => p.approved);

  const targets: ManagedDevice[] = deviceIds && Array.isArray(deviceIds)
    ? (deviceIds.map((id: string) => store.devices.get(id)).filter(Boolean) as ManagedDevice[])
    : Array.from(store.devices.values());

  const queuedCommands: DeviceCommand[] = [];

  for (const dev of targets) {
    const cmdId = `cmd-${uuidv4().substring(0, 8)}`;
    const cmd: DeviceCommand = {
      id: cmdId,
      deviceId: dev.id,
      orgId: req.user!.orgId,
      commandType: 'install_approved_patches',
      payload: { patchId, approvedCount: approvedPatches.length },
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    store.deviceCommands.set(cmdId, cmd);
    queuedCommands.push(cmd);
  }

  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'patch.deploy',
    targetType: 'patch',
    targetId: patchId || 'all_approved',
    details: { targetCount: targets.length },
    ipAddress: req.ip
  });

  res.status(202).json({
    success: true,
    message: `Deployment queued for ${targets.length} devices`,
    commands: queuedCommands
  });
});

export default router;
