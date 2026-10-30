import { timingSafeEqual } from 'crypto';
import { store } from '../db/store.js';
import type { ManagedDevice } from '@openmsp/api-types';

const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Error codes agents act on. `device_unknown` tells an agent its record is gone
 * and it should re-enroll with its saved enrollment token.
 */
export type DeviceAuthCode = 'missing_credentials' | 'device_unknown' | 'invalid_secret';

export type DeviceAuthResult =
  | { ok: true; device: ManagedDevice }
  | { ok: false; status: number; code: DeviceAuthCode; error: string };

function secretsMatch(expected: string, given: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Authenticates an endpoint agent by deviceId + deviceSecret. A device with no
 * stored secret never authenticates: it must enroll to get one.
 */
export function authenticateDevice(deviceId: unknown, deviceSecret: unknown): DeviceAuthResult {
  if (typeof deviceId !== 'string' || !deviceId || typeof deviceSecret !== 'string' || !deviceSecret) {
    return { ok: false, status: 401, code: 'missing_credentials', error: 'Device ID and secret are required' };
  }
  const device = store.devices.get(deviceId);
  if (!device) {
    return { ok: false, status: 401, code: 'device_unknown', error: 'Unknown device; re-enroll required' };
  }
  const stored = (device as any).deviceSecret;
  if (typeof stored !== 'string' || !stored || !secretsMatch(stored, deviceSecret)) {
    return { ok: false, status: 401, code: 'invalid_secret', error: 'Invalid device secret' };
  }
  return { ok: true, device };
}

/**
 * The org a device belongs to. Set at enrollment from the enrollment token;
 * devices enrolled before that fall back to their client's org, then the
 * first org (the platform has been single-org until now).
 */
export function deviceOrgId(device: ManagedDevice): string {
  const own = (device as any).orgId;
  if (typeof own === 'string' && own) return own;
  const clientOrg = (store.clients.get(device.clientId) as any)?.orgId;
  if (typeof clientOrg === 'string' && clientOrg) return clientOrg;
  return Array.from(store.orgs.values())[0]?.id || DEFAULT_ORG_ID;
}
