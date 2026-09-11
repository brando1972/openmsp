import { Router } from 'express';
import { store } from '../db/store.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// GET /api/v1/audit
router.get('/', (req: AuthenticatedRequest, res) => {
  const { limit, action } = req.query;
  let events = [...store.auditEvents];

  if (action) {
    events = events.filter((e) => e.action === action);
  }

  const max = limit ? parseInt(limit as string, 10) : 100;
  res.json(events.slice(0, max));
});

export default router;
