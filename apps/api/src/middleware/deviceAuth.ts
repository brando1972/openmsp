import { timingSafeEqual } from 'crypto';
import { store } from '../db/store.js';
import type { ManagedDevice } from '@openmsp/api-types';

const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Error codes agents act on. `device_unknown` tells an agent its record is gone
 * and it should re-enroll with its saved enrollment token.
 */
export type DeviceAuthCode = 'missing_credentials' | 'device_unknown' | 'invalid_secret' | 'e2ee_required';

export type DeviceAuthResult =
  | { ok: true; device: ManagedDevice }
  | { ok: false; status: number; code: DeviceAuthCode; error: string };

function secretsMatch(expected: string, given: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Authenticates an endpoint agent by deviceId + deviceSecret (or pre-verified E2EE envelope).
 * Only secrets explicitly minted by the control plane during enrollment are accepted.
 */
export function authenticateDevice(
  deviceId: unknown,
  deviceSecret: unknown,
  e2eeVerifiedDeviceId?: string
): DeviceAuthResult {
  if (typeof deviceId !== 'string' || !deviceId) {
    return { ok: false, status: 401, code: 'missing_credentials', error: 'Device ID is required' };
  }
  const device = store.devices.get(deviceId);
  if (!device) {
    return { ok: false, status: 401, code: 'device_unknown', error: 'Unknown device; re-enroll required' };
  }

  // If the request was already authenticated via Ed25519 + X25519 E2EE envelope for this exact deviceId
  if (e2eeVerifiedDeviceId && e2eeVerifiedDeviceId === deviceId && (device as any).deviceSignPub) {
    return { ok: true, device };
  }

  // Strict v2-e2ee Downgrade Lock: once a device has bound Ed25519 + X25519 public keys,
  // reject plaintext requests that only supply deviceSecret (unless rekeyPending or explicitly overridden).
  if (
    (device as any).deviceSignPub &&
    (device as any).deviceBoxPub &&
    !(device as any).e2eeRekeyPending &&
    process.env.ALLOW_PLAINTEXT_DOWNGRADE !== '1'
  ) {
    return {
      ok: false,
      status: 401,
      code: 'e2ee_required',
      error: 'Plaintext downgrade rejected: device has bound v2-e2ee Ed25519/X25519 keys'
    };
  }

  if (typeof deviceSecret !== 'string' || !deviceSecret) {
    return { ok: false, status: 401, code: 'missing_credentials', error: 'Device ID and secret are required' };
  }

  const stored = (device as any).deviceSecret;
  if (typeof stored === 'string' && stored && secretsMatch(stored, deviceSecret)) {
    return { ok: true, device };
  }

  // Check bounded ring buffer of prior server-issued secrets for this device (e.g. when a
  // PowerShell bootstrapper and openmsp-agent.exe both called /enroll within seconds).
  const issuedList: string[] = Array.isArray((device as any).issuedSecrets) ? (device as any).issuedSecrets : [];
  for (const prev of issuedList) {
    if (typeof prev === 'string' && prev && secretsMatch(prev, deviceSecret)) {
      (device as any).deviceSecret = deviceSecret;
      store.devices.set(device.id, device);
      return { ok: true, device };
    }
  }

  return { ok: false, status: 401, code: 'invalid_secret', error: 'Invalid device secret; re-enroll required' };
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
