import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { store, type DBUser } from '../db/store.js';
import type { UserProfile, UserRole } from '@openmsp/api-types';

const JWT_SECRET = process.env.JWT_SECRET || 'openmsp-development-jwt-secret-key-32chars!';

export interface AuthenticatedRequest extends Request {
  user?: UserProfile;
}

export function generateToken(user: DBUser): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.fullName,
      role: user.role,
      orgId: user.orgId,
      orgName: user.orgName
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function verifyToken(token: string): UserProfile | null {
  try {
    return jwt.verify(token, JWT_SECRET) as UserProfile;
  } catch {
    return null;
  }
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  req.user = payload;
  next();
}

export function requireRole(allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthenticated' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
      return;
    }
    next();
  };
}
