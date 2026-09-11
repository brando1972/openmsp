import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../db/store.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import type { VaultItem } from '@openmsp/api-types';

const router = Router();
router.use(authenticate);

// GET /api/v1/vault/items (Metadata only, passwords masked)
router.get('/items', (req, res) => {
  const items = Array.from(store.vaultItems.values()).map((item) => ({
    ...item,
    password: item.password ? '••••••••••••' : undefined
  }));
  res.json(items);
});

// POST /api/v1/vault/items
router.post('/items', (req: AuthenticatedRequest, res) => {
  const { clientId, folder, type, title, username, password, url, notes, totpSecret } = req.body;
  if (!title || !clientId) {
    res.status(400).json({ error: 'Title and clientId are required' });
    return;
  }

  const client = store.clients.get(clientId);
  const clientName = client ? client.name : 'Unknown Client';
  const id = `v-${uuidv4().substring(0, 8)}`;

  const item: VaultItem = {
    id,
    clientId,
    clientName,
    folder: folder || 'General',
    type: type || 'login',
    title,
    username,
    password: password ? '••••••••••••' : undefined,
    url,
    notes,
    totpSecret,
    totpCode: totpSecret ? '849201' : undefined,
    totpRemainingSeconds: 22,
    favorite: false,
    strengthScore: password ? Math.min(100, Math.max(40, password.length * 7)) : 70,
    lastModified: new Date().toISOString()
  };

  store.vaultItems.set(id, item);

  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'vault.item_create',
    targetType: 'vault_item',
    targetId: id,
    details: { title, clientId, type },
    ipAddress: req.ip
  });

  res.status(201).json(item);
});

// DELETE /api/v1/vault/items/:id
router.delete('/items/:id', (req: AuthenticatedRequest, res) => {
  const itemId = req.params.id as string;
  const item = store.vaultItems.get(itemId);
  if (!item) {
    res.status(404).json({ error: 'Vault item not found' });
    return;
  }

  store.vaultItems.delete(itemId);

  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'vault.item_delete',
    targetType: 'vault_item',
    targetId: itemId,
    details: { title: item.title },
    ipAddress: req.ip
  });

  res.json({ success: true });
});

// POST /api/v1/vault/unlock
router.post('/unlock', (req: AuthenticatedRequest, res) => {
  const { masterPassword } = req.body;
  if (!masterPassword) {
    res.status(400).json({ error: 'Master password is required to unlock the vault' });
    return;
  }

  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'vault.unlock',
    targetType: 'vault',
    targetId: req.user!.orgId,
    details: {},
    ipAddress: req.ip
  });

  res.json({
    unlocked: true,
    expiresInSeconds: 900 // 15 min lock session
  });
});

export default router;
