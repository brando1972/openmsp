import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Request, Response, NextFunction } from 'express';
import { store } from '../db/store.js';

/**
 * ApexMSP v2 End-to-End Encryption (E2EE) Middleware for Endpoint Agents
 * ---------------------------------------------------------------------------
 * Wire-compatible counterpart to `apps/agent/internal/e2ee/e2ee.go`:
 *   - Key Agreement:  X25519 (RFC 7748) -> SHA-256 KDF bound to (deviceBoxPub, serverBoxPub)
 *   - AEAD Cipher:    ChaCha20-Poly1305 (256-bit key, 96-bit nonce, 128-bit auth tag)
 *   - Digital Sig:    Ed25519 (RFC 8032) over canonical header + SHA-256(ciphertext)
 *   - Replay Guard:   ±120s timestamp window + bounded per-device nonce cache
 */

export const ENVELOPE_VERSION = 'v2-e2ee';
const MAX_CLOCK_SKEW_MS = 120 * 1000;

// ASN.1 DER prefixes for raw 32-byte Ed25519 and X25519 keys (RFC 8410)
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const X25519_SPKI_PREFIX = Buffer.from('302a300506032b656e032100', 'hex');
const X25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b656e04220420', 'hex');

export interface AgentEnvelopeWire {
  v: string;
  deviceId: string;
  senderBoxPub: string;
  senderSignPub?: string;
  ts: number;
  nonce: string;
  ct: string;
  sig: string;
}

interface ServerKeyMaterial {
  signSeedB64: string; // 32-byte Ed25519 private seed
  signPubB64: string;  // 32-byte Ed25519 public key
  boxPrivB64: string;  // 32-byte X25519 private scalar
  boxPubB64: string;   // 32-byte X25519 public point
  signPrivKey: crypto.KeyObject;
  boxPrivKey: crypto.KeyObject;
}

let cachedServerKeys: ServerKeyMaterial | null = null;
const seenNonces = new Map<string, number>(); // `${deviceId}:${nonce}` -> expiresAtMs

function pruneSeenNonces(nowMs: number): void {
  if (seenNonces.size < 2000) return;
  for (const [k, exp] of seenNonces.entries()) {
    if (exp < nowMs) seenNonces.delete(k);
  }
}

function ed25519PubFromRaw(raw32: Buffer): crypto.KeyObject {
  return crypto.createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, raw32]),
    format: 'der',
    type: 'spki'
  });
}

function ed25519PrivFromSeed(seed32: Buffer): crypto.KeyObject {
  return crypto.createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, seed32]),
    format: 'der',
    type: 'pkcs8'
  });
}

function x25519PubFromRaw(raw32: Buffer): crypto.KeyObject {
  return crypto.createPublicKey({
    key: Buffer.concat([X25519_SPKI_PREFIX, raw32]),
    format: 'der',
    type: 'spki'
  });
}

function x25519PrivFromRaw(raw32: Buffer): crypto.KeyObject {
  return crypto.createPrivateKey({
    key: Buffer.concat([X25519_PKCS8_PREFIX, raw32]),
    format: 'der',
    type: 'pkcs8'
  });
}

export function getServerE2EEKeys(): ServerKeyMaterial {
  if (cachedServerKeys) return cachedServerKeys;

  const dataDir = process.env.DATA_DIR || path.resolve(process.cwd(), '.data');
  const keyFile = path.join(dataDir, 'server-e2ee-keys.json');

  try {
    if (fs.existsSync(keyFile)) {
      const parsed = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
      const signSeed = Buffer.from(parsed.signSeedB64, 'base64');
      const signPub = Buffer.from(parsed.signPubB64, 'base64');
      const boxPriv = Buffer.from(parsed.boxPrivB64, 'base64');
      const boxPub = Buffer.from(parsed.boxPubB64, 'base64');
      if (signSeed.length === 32 && signPub.length === 32 && boxPriv.length === 32 && boxPub.length === 32) {
        cachedServerKeys = {
          signSeedB64: parsed.signSeedB64,
          signPubB64: parsed.signPubB64,
          boxPrivB64: parsed.boxPrivB64,
          boxPubB64: parsed.boxPubB64,
          signPrivKey: ed25519PrivFromSeed(signSeed),
          boxPrivKey: x25519PrivFromRaw(boxPriv)
        };
        return cachedServerKeys;
      }
    }
  } catch {
    // Regenerate below if unreadable
  }

  const edPair = crypto.generateKeyPairSync('ed25519');
  const edPrivDer = edPair.privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer;
  const edPubDer = edPair.publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  const signSeed = edPrivDer.subarray(edPrivDer.length - 32);
  const signPub = edPubDer.subarray(edPubDer.length - 32);

  const xPair = crypto.generateKeyPairSync('x25519');
  const xPrivDer = xPair.privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer;
  const xPubDer = xPair.publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  const boxPriv = xPrivDer.subarray(xPrivDer.length - 32);
  const boxPub = xPubDer.subarray(xPubDer.length - 32);

  cachedServerKeys = {
    signSeedB64: signSeed.toString('base64'),
    signPubB64: signPub.toString('base64'),
    boxPrivB64: boxPriv.toString('base64'),
    boxPubB64: boxPub.toString('base64'),
    signPrivKey: edPair.privateKey,
    boxPrivKey: xPair.privateKey
  };

  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(
      keyFile,
      JSON.stringify(
        {
          signSeedB64: cachedServerKeys.signSeedB64,
          signPubB64: cachedServerKeys.signPubB64,
          boxPrivB64: cachedServerKeys.boxPrivB64,
          boxPubB64: cachedServerKeys.boxPubB64,
          createdAt: new Date().toISOString()
        },
        null,
        2
      ),
      { mode: 0o600 }
    );
  } catch {
    // Ephemeral fallback if filesystem is read-only
  }

  return cachedServerKeys;
}

export function deriveSharedE2EEKey(deviceBoxPubB64: string): Buffer {
  const srv = getServerE2EEKeys();
  const peerRaw = Buffer.from(deviceBoxPubB64, 'base64');
  if (peerRaw.length !== 32) {
    throw new Error('Invalid device X25519 public key length');
  }
  const peerPubKey = x25519PubFromRaw(peerRaw);
  const shared = crypto.diffieHellman({
    privateKey: srv.boxPrivKey,
    publicKey: peerPubKey
  });

  const h = crypto.createHash('sha256');
  h.update('apexmsp-e2ee-v2:');
  h.update(shared);
  h.update(':');
  h.update(deviceBoxPubB64);
  h.update(':');
  h.update(srv.boxPubB64);
  return h.digest();
}

function buildAAD(deviceId: string, ts: number, nonceB64: string): Buffer {
  return Buffer.from(`apexmsp-aad-v2:${deviceId}:${ts}:${nonceB64}`, 'utf8');
}

function buildSignPayload(
  deviceId: string,
  ts: number,
  nonceB64: string,
  senderBoxPubB64: string,
  ciphertextWithTag: Buffer
): Buffer {
  const ctHex = crypto.createHash('sha256').update(ciphertextWithTag).digest('hex');
  return Buffer.from(`apexmsp-sig-v2:${deviceId}:${ts}:${nonceB64}:${senderBoxPubB64}:${ctHex}`, 'utf8');
}

export function openAgentEnvelope(env: AgentEnvelopeWire): {
  deviceId: string;
  deviceBoxPub: string;
  deviceSignPub: string;
  plaintext: Buffer;
} {
  if (!env || env.v !== ENVELOPE_VERSION) {
    throw new Error('Unsupported E2EE envelope version');
  }
  const deviceId = String(env.deviceId || '').trim();
  const senderBoxPub = String(env.senderBoxPub || '').trim();
  const senderSignPub = String(env.senderSignPub || '').trim();
  const ts = Number(env.ts || 0);
  const nonceB64 = String(env.nonce || '').trim();

  if (!deviceId || !senderBoxPub || !ts || !nonceB64 || !env.ct || !env.sig) {
    throw new Error('Malformed E2EE envelope fields');
  }

  const nowMs = Date.now();
  if (Math.abs(nowMs - ts) > MAX_CLOCK_SKEW_MS) {
    throw new Error('Envelope timestamp outside replay window');
  }

  pruneSeenNonces(nowMs);
  const nonceKey = `${deviceId}:${nonceB64}`;
  if (seenNonces.has(nonceKey)) {
    throw new Error('Replay detected: duplicate envelope nonce');
  }

  const device = store.devices.get(deviceId) as any;
  const isRekeyPending = Boolean(device?.e2eeRekeyPending);
  const boundSignPub: string =
    isRekeyPending && senderSignPub ? senderSignPub : device?.deviceSignPub || senderSignPub;
  const boundBoxPub: string =
    isRekeyPending && senderBoxPub ? senderBoxPub : device?.deviceBoxPub || senderBoxPub;

  if (!boundSignPub) {
    throw new Error('Missing device Ed25519 public key');
  }
  if (!isRekeyPending && device?.deviceSignPub && senderSignPub && device.deviceSignPub !== senderSignPub) {
    throw new Error('Device Ed25519 public key mismatch');
  }
  if (!isRekeyPending && device?.deviceBoxPub && senderBoxPub && device.deviceBoxPub !== senderBoxPub) {
    throw new Error('Device X25519 public key mismatch');
  }

  const ctWithTag = Buffer.from(env.ct, 'base64');
  if (ctWithTag.length < 16) {
    throw new Error('Ciphertext shorter than Poly1305 tag');
  }
  const sigBuf = Buffer.from(env.sig, 'base64');
  const signRaw = Buffer.from(boundSignPub, 'base64');
  if (sigBuf.length !== 64 || signRaw.length !== 32) {
    throw new Error('Invalid Ed25519 key or signature length');
  }

  const sigPayload = buildSignPayload(deviceId, ts, nonceB64, senderBoxPub, ctWithTag);
  const pubKeyObj = ed25519PubFromRaw(signRaw);
  if (!crypto.verify(null, sigPayload, pubKeyObj, sigBuf)) {
    throw new Error('Envelope Ed25519 signature verification failed');
  }

  const key = deriveSharedE2EEKey(boundBoxPub);
  const nonceBuf = Buffer.from(nonceB64, 'base64');
  if (nonceBuf.length !== 12) {
    throw new Error('Invalid 96-bit ChaCha20-Poly1305 nonce');
  }

  const ctBody = ctWithTag.subarray(0, ctWithTag.length - 16);
  const authTag = ctWithTag.subarray(ctWithTag.length - 16);
  const aad = buildAAD(deviceId, ts, nonceB64);

  const decipher = crypto.createDecipheriv('chacha20-poly1305', key, nonceBuf, { authTagLength: 16 });
  decipher.setAAD(aad, { plaintextLength: ctBody.length });
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ctBody), decipher.final()]);

  // Record nonce only after signature + AEAD authentication succeed
  seenNonces.set(nonceKey, nowMs + MAX_CLOCK_SKEW_MS * 2);

  // Bind TOFU keys if device was already enrolled and just upgraded to v2-e2ee, or completed an authorized re-key
  if (device && (!device.deviceSignPub || !device.deviceBoxPub || (isRekeyPending && (device.deviceSignPub !== boundSignPub || device.deviceBoxPub !== boundBoxPub)))) {
    device.deviceSignPub = boundSignPub;
    device.deviceBoxPub = boundBoxPub;
    if (isRekeyPending && (senderSignPub || senderBoxPub)) {
      device.e2eeRekeyPending = false;
      device.e2eeRotatedAt = new Date().toISOString();
    }
    store.devices.set(deviceId, device);
  }

  return {
    deviceId,
    deviceBoxPub: boundBoxPub,
    deviceSignPub: boundSignPub,
    plaintext
  };
}

export function sealServerEnvelope(deviceId: string, deviceBoxPubB64: string, payloadObj: unknown): AgentEnvelopeWire {
  const srv = getServerE2EEKeys();
  const key = deriveSharedE2EEKey(deviceBoxPubB64);
  const nonceBuf = crypto.randomBytes(12);
  const nonceB64 = nonceBuf.toString('base64');
  const ts = Date.now();
  const plainBuf = Buffer.from(JSON.stringify(payloadObj), 'utf8');
  const aad = buildAAD(deviceId, ts, nonceB64);

  const cipher = crypto.createCipheriv('chacha20-poly1305', key, nonceBuf, { authTagLength: 16 });
  cipher.setAAD(aad, { plaintextLength: plainBuf.length });
  const encrypted = Buffer.concat([cipher.update(plainBuf), cipher.final()]);
  const tag = cipher.getAuthTag();
  const ctWithTag = Buffer.concat([encrypted, tag]);

  const sigPayload = buildSignPayload(deviceId, ts, nonceB64, srv.boxPubB64, ctWithTag);
  const sigBuf = crypto.sign(null, sigPayload, srv.signPrivKey);

  return {
    v: ENVELOPE_VERSION,
    deviceId,
    senderBoxPub: srv.boxPubB64,
    senderSignPub: srv.signPubB64,
    ts,
    nonce: nonceB64,
    ct: ctWithTag.toString('base64'),
    sig: sigBuf.toString('base64')
  };
}

/**
 * Signs a dispatched DeviceCommand using the Control Plane's Ed25519 private key.
 * Matches `e2ee.VerifyCommandSignature` in the Go agent (`internal/e2ee/e2ee.go`).
 */
export function signDeviceCommand(cmd: {
  id: string;
  deviceId: string;
  commandType: string;
  payload?: Record<string, unknown>;
}): string {
  const srv = getServerE2EEKeys();
  const p = cmd.payload || {};
  const str = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : '');
  const scriptHex = crypto.createHash('sha256').update(str('script'), 'utf8').digest('hex');
  const msg = Buffer.from(
    `apexmsp-cmd-v1:${cmd.id}:${cmd.deviceId}:${cmd.commandType}:${scriptHex}:${str('actionType')}:${str('targetPath')}:${str('hostname')}`,
    'utf8'
  );
  return crypto.sign(null, msg, srv.signPrivKey).toString('base64');
}

/**
 * Signs an agent binary release entry ("apexmsp-release-v1:<version>:<os>/<arch>:<sha256>").
 * Matches `e2ee.VerifyReleaseSignature` in the Go agent (`internal/e2ee/e2ee.go`).
 */
export function signReleaseArtifact(
  version: string,
  osArch: string,
  sha256Hex: string
): { ed25519Sig: string; serverSignPub: string } {
  const srv = getServerE2EEKeys();
  const msg = Buffer.from(
    `apexmsp-release-v1:${version}:${osArch}:${String(sha256Hex || '').trim().toLowerCase()}`,
    'utf8'
  );
  const sig = crypto.sign(null, msg, srv.signPrivKey);
  return {
    ed25519Sig: sig.toString('base64'),
    serverSignPub: srv.signPubB64
  };
}

/**
 * Express middleware that transparently unwraps incoming `v2-e2ee` envelopes
 * on `/api/v1/agents/*` and seals JSON responses back to the endpoint agent.
 */
export function agentEnvelopeMiddleware(req: Request, res: Response, next: NextFunction): void {
  const isE2EE =
    req.headers['x-apex-e2ee'] === ENVELOPE_VERSION ||
    (req.body && typeof req.body === 'object' && req.body.v === ENVELOPE_VERSION);

  if (!isE2EE) {
    next();
    return;
  }

  try {
    const opened = openAgentEnvelope(req.body as AgentEnvelopeWire);
    const parsedBody = JSON.parse(opened.plaintext.toString('utf8'));
    req.body = parsedBody;
    (req as any).e2eeVerifiedDeviceId = opened.deviceId;
    (req as any).e2eeDeviceBoxPub = opened.deviceBoxPub;

    const origJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          const sealed = sealServerEnvelope(opened.deviceId, opened.deviceBoxPub, body);
          res.setHeader('X-Apex-E2EE', ENVELOPE_VERSION);
          return origJson(sealed);
        } catch {
          return origJson(body);
        }
      }
      return origJson(body);
    }) as any;

    next();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'E2EE envelope verification failed';
    // If the server rotated keys or device key doesn't match, signal 428 so agent refreshes ServerBoxPub
    if (msg.includes('aead') || msg.includes('Unsupported state or unable to authenticate data')) {
      res.status(428).json({ error: msg, code: 'e2ee_rekey_required' });
      return;
    }
    res.status(401).json({ error: msg, code: 'invalid_e2ee_envelope' });
  }
}
