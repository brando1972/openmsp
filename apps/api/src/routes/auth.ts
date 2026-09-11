import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { store } from '../db/store.js';
import { generateToken, authenticate, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// POST /api/v1/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const user = Array.from(store.users.values()).find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const token = generateToken(user);

  store.recordAudit({
    orgId: user.orgId,
    userId: user.id,
    actorName: user.fullName,
    action: 'auth.login',
    targetType: 'user',
    targetId: user.id,
    details: { email: user.email },
    ipAddress: req.ip
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.fullName,
      role: user.role,
      orgId: user.orgId,
      orgName: user.orgName,
      createdAt: user.createdAt
    }
  });
});

// POST /api/v1/auth/logout
router.post('/logout', authenticate, (req: AuthenticatedRequest, res) => {
  if (req.user) {
    store.recordAudit({
      orgId: req.user.orgId,
      userId: req.user.id,
      actorName: req.user.name,
      action: 'auth.logout',
      targetType: 'user',
      targetId: req.user.id,
      details: {},
      ipAddress: req.ip
    });
  }
  res.json({ success: true });
});

// GET /api/v1/me
router.get('/me', authenticate, (req: AuthenticatedRequest, res) => {
  res.json(req.user);
});

export default router;
