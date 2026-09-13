import type { Request, Response, NextFunction } from 'express';
import { store } from '../db/store.js';

// Subdomains that are NOT tenants.
const RESERVED = new Set(['admin', 'api', 'www', 'app', 'mesh', 'vault', 'localhost']);

export interface TenantRequest extends Request {
  tenantSlug?: string;
  tenantOrgId?: string;
  isAdminHost?: boolean;
}

// Resolves the tenant for a request from (in priority) the X-Tenant header or
// the Host subdomain. admin.apexmsp.app is flagged isAdminHost (global admin).
export function resolveTenant(req: TenantRequest, _res: Response, next: NextFunction): void {
  const header = (req.headers['x-tenant'] as string | undefined)?.trim().toLowerCase();
  const host = ((req.headers['x-forwarded-host'] as string) || req.headers.host || '')
    .split(',')[0]
    .split(':')[0]
    .toLowerCase();
  const sub = host.split('.')[0];

  const slug = header || sub;
  req.isAdminHost = slug === 'admin';

  if (slug && !RESERVED.has(slug)) {
    const org = Array.from(store.orgs.values()).find((o) => o.slug === slug);
    if (org) {
      req.tenantSlug = org.slug;
      req.tenantOrgId = org.id;
    }
  }
  next();
}
