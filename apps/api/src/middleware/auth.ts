import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { UserProfile } from '@openmsp/api-types';
import { store } from '../db/store.js';

const JWT_SECRET = process.env.JWT_SECRET || 'openmsp-super-secret-jwt-key-2026-dev-only';
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || '';

export const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://hbewdpkyumcsultgebmj.supabase.co').replace(/\/$/, '');
export const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiZXdkcGt5dW1jc3VsdGdlYm1qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMDk4NjgsImV4cCI6MjEwMTg4NTg2OH0.f2C9MQGsN5qAXiB3ONb2G4uCx4CnF_8ae3Q9a-tNF7M';

/**
 * Built-in + dynamically refreshed JWKS public keys for Supabase Auth ES256 tokens.
 */
const jwksPemByKid = new Map<string, string>();

function registerJwk(jwk: Record<string, unknown>): void {
  try {
    const kid = typeof jwk.kid === 'string' ? jwk.kid : 'default';
    const pubKey = crypto.createPublicKey({ key: jwk as unknown as crypto.JsonWebKey, format: 'jwk' });
    const pem = pubKey.export({ type: 'spki', format: 'pem' }).toString();
    jwksPemByKid.set(kid, pem);
  } catch (err) {
    console.warn('[auth] failed to parse JWK:', (err as Error).message);
  }
}

// Seed canonical Supabase project ES256 JWK so verification is instant (<0.1ms) on cold start
registerJwk({
  alg: 'ES256',
  crv: 'P-256',
  ext: true,
  key_ops: ['verify'],
  kid: 'f91aa387-9811-4375-ac8e-74dd466f11a8',
  kty: 'EC',
  use: 'sig',
  x: 'vTE2Yhiu3G_mjlwZlpjMtuN-GMynkSXFIp1Ah5NVZ_0',
  y: 'hz5WPxzablrMqtMGxBjevFosGorIPBsyPf4z1obrXic'
});

async function refreshSupabaseJwks(): Promise<void> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`);
    if (!res.ok) return;
    const data = (await res.json()) as { keys?: Array<Record<string, unknown>> };
    if (Array.isArray(data.keys)) {
      for (const k of data.keys) registerJwk(k);
    }
  } catch {
    // Keep cached JWKS on transient network error
  }
}

void refreshSupabaseJwks();
setInterval(() => void refreshSupabaseJwks(), 15 * 60 * 1000).unref?.();

const ALLOWED_OPERATOR_DOMAINS = new Set([
  'apexmsp.com',
  'apexmsp.app',
  'southerntechsupport.com',
  'openmsp.local',
  'devguru.app'
]);

function isAuthorizedOperatorEmail(email: string, projectClaim?: string): boolean {
  if (projectClaim === 'apexmsp') return true;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  for (const u of store.users.values()) {
    if (u.email.toLowerCase() === normalized) return true;
  }
  const domain = normalized.split('@')[1] || '';
  return ALLOWED_OPERATOR_DOMAINS.has(domain);
}

export interface AuthenticatedRequest extends Request {
  user?: UserProfile;
  authAal?: 'aal1' | 'aal2';
}

export function generateToken(user: UserProfile): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      orgId: user.orgId,
      orgName: user.orgName,
      createdAt: user.createdAt
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

export function verifyToken(token: string): UserProfile | null {
  if (!token || typeof token !== 'string') return null;
  const trimmed = token.trim();
  if (
    !trimmed ||
    trimmed === 'dev-soc-operator-token' ||
    trimmed === 'openmsp-demo-auth-token' ||
    trimmed.startsWith('dev-') ||
    trimmed.startsWith('tok-')
  ) {
    return null;
  }

  // 1. Inspect JWT header to determine if it is a Supabase ES256 JWT or local HS256 JWT
  try {
    const parts = trimmed.split('.');
    if (parts.length === 3) {
      const headerJson = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as {
        alg?: string;
        kid?: string;
      };

      if (headerJson.alg === 'ES256') {
        const pem =
          (headerJson.kid && jwksPemByKid.get(headerJson.kid)) ||
          Array.from(jwksPemByKid.values())[0];
        if (pem) {
          const decoded = jwt.verify(trimmed, pem, { algorithms: ['ES256'] }) as Record<string, any>;
          const email = String(decoded.email || decoded.user_metadata?.email || '').trim().toLowerCase();
          const appMeta = (decoded.app_metadata || {}) as Record<string, any>;
          const userMeta = (decoded.user_metadata || {}) as Record<string, any>;

          if (!isAuthorizedOperatorEmail(email, appMeta.project)) {
            return null;
          }

          const defaultOrg = Array.from(store.orgs.values())[0];
          const matchedLocalUser = Array.from(store.users.values()).find(
            (u) => u.email.toLowerCase() === email
          );

          return {
            id: String(decoded.sub || matchedLocalUser?.id || '00000000-0000-0000-0000-000000000002'),
            email: email || matchedLocalUser?.email || 'brandon@apexmsp.com',
            name: String(
              userMeta.full_name ||
                userMeta.name ||
                matchedLocalUser?.fullName ||
                'Brandon Ray'
            ),
            role: (appMeta.role || matchedLocalUser?.role || 'owner') as UserProfile['role'],
            orgId: String(
              appMeta.org_id ||
                userMeta.org_id ||
                matchedLocalUser?.orgId ||
                defaultOrg?.id ||
                '00000000-0000-0000-0000-000000000001'
            ),
            orgName: String(
              userMeta.org_name ||
                matchedLocalUser?.orgName ||
                defaultOrg?.name ||
                'ApexMSP'
            ),
            createdAt: decoded.iat
              ? new Date(Number(decoded.iat) * 1000).toISOString()
              : matchedLocalUser?.createdAt || new Date().toISOString()
          };
        }
      }
    }
  } catch {
    // Fall through to HS256 check
  }

  // 2. Verify local API HS256 JWT (or SUPABASE_JWT_SECRET if HS256)
  for (const secret of [JWT_SECRET, SUPABASE_JWT_SECRET].filter(Boolean)) {
    try {
      const decoded = jwt.verify(trimmed, secret) as Record<string, any>;
      if (decoded && (decoded.id || decoded.sub) && decoded.email) {
        const defaultOrg = Array.from(store.orgs.values())[0];
        return {
          id: String(decoded.id || decoded.sub),
          email: String(decoded.email),
          name: String(decoded.name || decoded.user_metadata?.full_name || 'Brandon Ray'),
          role: (decoded.role === 'authenticated'
            ? decoded.app_metadata?.role || 'owner'
            : decoded.role || 'owner') as UserProfile['role'],
          orgId: String(
            decoded.orgId ||
              decoded.app_metadata?.org_id ||
              defaultOrg?.id ||
              '00000000-0000-0000-0000-000000000001'
          ),
          orgName: String(decoded.orgName || defaultOrg?.name || 'ApexMSP'),
          createdAt: String(decoded.createdAt || new Date().toISOString())
        };
      }
    } catch {
      // Try next secret
    }
  }

  return null;
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  let token = '';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (typeof req.query.token === 'string' && req.query.token.trim()) {
    token = req.query.token.trim();
  }

  if (!token) {
    res.status(401).json({
      error: 'Authentication required. Please sign in to ApexMSP with Supabase Auth.'
    });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({
      error: 'Invalid or expired authentication session. Please sign in again.'
    });
    return;
  }

  req.user = payload;
  next();
}

export function requireRole(allowedRoles: Array<UserProfile['role']>) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthenticated' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden: Insufficient role permissions' });
      return;
    }
    next();
  };
}
