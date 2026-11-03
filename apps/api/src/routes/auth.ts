import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { store } from '../db/store.js';
import {
  generateToken,
  verifyToken,
  authenticate,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  type AuthenticatedRequest
} from '../middleware/auth.js';
import type { AuthLoginRequest, AuthLoginResponse, UserProfile } from '@openmsp/api-types';

const router = Router();

// GET /api/v1/auth/config — public Supabase Auth configuration for console client
router.get('/config', (_req, res) => {
  res.json({
    provider: 'supabase',
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
    mfaSupported: true
  });
});

// POST /api/v1/auth/login — authenticates against Supabase Auth (primary) or local operator store (fallback)
router.post('/login', async (req, res) => {
  const { email, password } = (req.body || {}) as AuthLoginRequest;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  // 1. Primary: Authenticate via Supabase Auth (GoTrue /auth/v1/token?grant_type=password)
  try {
    const supaRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: normalizedEmail, password })
    });

    if (supaRes.ok) {
      const supaData = (await supaRes.json()) as {
        access_token: string;
        refresh_token?: string;
        user?: Record<string, any>;
      };

      const profile = verifyToken(supaData.access_token);
      if (!profile) {
        res.status(403).json({
          error: 'Account is not authorized as an ApexMSP operator.'
        });
        return;
      }

      store.recordAudit({
        orgId: profile.orgId,
        userId: profile.id,
        actorName: profile.name,
        action: 'auth.supabase_login',
        targetType: 'user',
        targetId: profile.id,
        details: { email: profile.email, provider: 'supabase' },
        ipAddress: req.ip
      });

      const response: AuthLoginResponse & { refreshToken?: string; authProvider?: string } = {
        token: supaData.access_token,
        refreshToken: supaData.refresh_token,
        user: profile,
        authProvider: 'supabase'
      };
      res.json(response);
      return;
    }
  } catch (err) {
    console.warn('[auth] Supabase Auth request error, checking local store:', (err as Error).message);
  }

  // 2. Fallback: Check local operator store (bcrypt)
  const user = Array.from(store.users.values()).find(
    (u) => u.email.toLowerCase() === normalizedEmail
  );

  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const profile: UserProfile = {
    id: user.id,
    email: user.email,
    name: user.fullName,
    role: user.role,
    orgId: user.orgId,
    orgName: user.orgName,
    createdAt: user.createdAt
  };

  const token = generateToken(profile);

  store.recordAudit({
    orgId: user.orgId,
    userId: user.id,
    actorName: user.fullName,
    action: 'auth.login',
    targetType: 'user',
    targetId: user.id,
    details: { email: user.email, provider: 'local_jwt' },
    ipAddress: req.ip
  });

  const response: AuthLoginResponse = {
    token,
    user: profile
  };

  res.json(response);
});

// POST /api/v1/auth/supabase-session — verifies a Supabase Auth access_token and returns operator profile
router.post('/supabase-session', (req, res) => {
  const accessToken = String(req.body?.accessToken || req.body?.token || '').trim();
  if (!accessToken) {
    res.status(400).json({ error: 'Missing Supabase accessToken' });
    return;
  }

  const profile = verifyToken(accessToken);
  if (!profile) {
    res.status(401).json({ error: 'Invalid or unauthorized Supabase session token' });
    return;
  }

  store.recordAudit({
    orgId: profile.orgId,
    userId: profile.id,
    actorName: profile.name,
    action: 'auth.supabase_session_exchange',
    targetType: 'user',
    targetId: profile.id,
    details: { email: profile.email },
    ipAddress: req.ip
  });

  res.json({
    token: accessToken,
    user: profile,
    authProvider: 'supabase'
  });
});

// POST /api/v1/auth/magic-link — sends a Supabase Auth OTP / Magic Link to an authorized operator email
router.post('/magic-link', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) {
    res.status(400).json({ error: 'Operator email is required' });
    return;
  }

  try {
    const otpRes = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        create_user: false,
        options: {
          emailRedirectTo: req.body?.redirectTo || 'https://apexmsp.app'
        }
      })
    });

    if (!otpRes.ok) {
      const errBody = (await otpRes.json().catch(() => ({}))) as Record<string, any>;
      res.status(otpRes.status).json({
        error: errBody.msg || errBody.error_description || errBody.error || 'Failed to send Supabase Magic Link'
      });
      return;
    }

    res.json({
      success: true,
      message: `Supabase magic link / OTP sent to ${email}`
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
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
      details: { email: req.user.email },
      ipAddress: req.ip
    });
  }
  res.json({ success: true });
});

// GET /api/v1/auth/me
router.get('/me', authenticate, (req: AuthenticatedRequest, res) => {
  res.json(req.user);
});

export default router;
