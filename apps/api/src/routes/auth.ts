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

// Per-IP rate limiter for magic link requests (max 5 attempts per 15 minutes)
const magicLinkRateLimit = new Map<string, { count: number; resetAt: number }>();
const MAGIC_LINK_WINDOW_MS = 15 * 60 * 1000;
const MAGIC_LINK_MAX_ATTEMPTS = 5;

const GENERIC_MAGIC_LINK_MESSAGE =
  'If this email is registered to an authorized operator, a one-time sign-in link has been sent.';

function checkMagicLinkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = magicLinkRateLimit.get(ip);
  if (!entry || now > entry.resetAt) {
    magicLinkRateLimit.set(ip, { count: 1, resetAt: now + MAGIC_LINK_WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= MAGIC_LINK_MAX_ATTEMPTS;
}

function isRegisteredOperatorEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  for (const u of store.users.values()) {
    if (u.email.toLowerCase() === normalized) return true;
  }
  return false;
}

// POST /api/v1/auth/login — authenticates operator credentials server-side
router.post('/login', async (req, res) => {
  const { email, password } = (req.body || {}) as AuthLoginRequest;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  // 1. Primary: Authenticate server-to-server against upstream identity provider
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
          error: 'Invalid email or password'
        });
        return;
      }

      store.recordAudit({
        orgId: profile.orgId,
        userId: profile.id,
        actorName: profile.name,
        action: 'auth.login',
        targetType: 'user',
        targetId: profile.id,
        details: { email: profile.email },
        ipAddress: req.ip
      });

      const response: AuthLoginResponse & { refreshToken?: string } = {
        token: supaData.access_token,
        refreshToken: supaData.refresh_token,
        user: profile
      };
      res.json(response);
      return;
    }
  } catch (err) {
    console.warn('[auth] upstream auth error, checking local store:', (err as Error).message);
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
    details: { email: user.email },
    ipAddress: req.ip
  });

  const response: AuthLoginResponse = {
    token,
    user: profile
  };

  res.json(response);
});

// POST /api/v1/auth/session (and legacy /supabase-session) — verifies an access_token and returns operator profile
router.post(['/session', '/supabase-session'], (req, res) => {
  const accessToken = String(req.body?.accessToken || req.body?.token || '').trim();
  if (!accessToken) {
    res.status(400).json({ error: 'Missing session token' });
    return;
  }

  const profile = verifyToken(accessToken);
  if (!profile) {
    res.status(401).json({ error: 'Invalid or expired session token' });
    return;
  }

  store.recordAudit({
    orgId: profile.orgId,
    userId: profile.id,
    actorName: profile.name,
    action: 'auth.session_exchange',
    targetType: 'user',
    targetId: profile.id,
    details: { email: profile.email },
    ipAddress: req.ip
  });

  res.json({
    token: accessToken,
    user: profile
  });
});

// POST /api/v1/auth/refresh — refreshes an operator session server-side
router.post('/refresh', async (req, res) => {
  const refreshToken = String(req.body?.refreshToken || '').trim();
  if (!refreshToken) {
    res.status(400).json({ error: 'Missing refresh token' });
    return;
  }

  try {
    const supaRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refresh_token: refreshToken })
    });

    if (!supaRes.ok) {
      res.status(401).json({ error: 'Session expired' });
      return;
    }

    const data = (await supaRes.json()) as {
      access_token: string;
      refresh_token?: string;
    };

    const profile = verifyToken(data.access_token);
    if (!profile) {
      res.status(403).json({ error: 'Unauthorized session' });
      return;
    }

    res.json({
      token: data.access_token,
      refreshToken: data.refresh_token,
      user: profile
    });
  } catch {
    res.status(500).json({ error: 'Unable to refresh session' });
  }
});

// POST /api/v1/auth/magic-link — sends a one-time magic link ONLY to pre-registered operators
router.post('/magic-link', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }

  const clientIp = String(req.ip || req.socket?.remoteAddress || 'unknown');
  if (!checkMagicLinkRateLimit(clientIp)) {
    res.status(429).json({ error: 'Too many sign-in link requests. Please wait 15 minutes.' });
    return;
  }

  const defaultOrgId = Array.from(store.orgs.values())[0]?.id || '00000000-0000-0000-0000-000000000001';

  // If the email is NOT a registered operator, never contact the auth backend or send an email,
  // log the blocked attempt, and return the exact same generic message to prevent email enumeration.
  if (!isRegisteredOperatorEmail(email)) {
    store.recordAudit({
      orgId: defaultOrgId,
      userId: 'unauthenticated',
      actorName: 'Anonymous',
      action: 'auth.magic_link_blocked',
      targetType: 'auth',
      targetId: email,
      details: { attemptedEmail: email, reason: 'unregistered_operator_email' },
      ipAddress: clientIp
    });

    res.json({
      success: true,
      message: GENERIC_MAGIC_LINK_MESSAGE
    });
    return;
  }

  try {
    await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
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

    store.recordAudit({
      orgId: defaultOrgId,
      userId: email,
      actorName: email,
      action: 'auth.magic_link_requested',
      targetType: 'user',
      targetId: email,
      details: { email },
      ipAddress: clientIp
    });
  } catch (err) {
    console.warn('[auth] magic-link dispatch error:', (err as Error).message);
  }

  res.json({
    success: true,
    message: GENERIC_MAGIC_LINK_MESSAGE
  });
});

// POST /api/v1/auth/logout
router.post('/logout', authenticate, async (req: AuthenticatedRequest, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (token) {
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`
        }
      });
    } catch {
      // ignore upstream logout error
    }
  }

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
