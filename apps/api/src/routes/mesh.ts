import { Router } from 'express';
import crypto from 'crypto';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { store, type TrustedOperatorMachine } from '../db/store.js';
import { meshClient, type MeshNode } from '../mesh/meshClient.js';
import { repairAgent, type HealAgent } from '../mesh/heal.js';
import type { ManagedDevice } from '@openmsp/api-types';

const RMM_STALE_MS = 10 * 60 * 1000;
const HANDSHAKE_TTL_MS = 45 * 1000;

interface PendingHandshakeChallenge {
  challengeId: string;
  challengeNonce: string;
  machineId: string;
  targetId: string;
  operatorId: string;
  serverEcdhPrivateKey: crypto.KeyObject;
  serverEcdhPubSpkiB64: string;
  expiresAt: number;
}

const pendingChallenges = new Map<string, PendingHandshakeChallenge>();

function computeSpkiFingerprint(spkiB64: string): string {
  const der = Buffer.from(spkiB64, 'base64');
  const hex = crypto.createHash('sha256').update(der).digest('hex').toUpperCase();
  return hex.match(/.{1,2}/g)?.slice(0, 16).join(':') || hex;
}

function verifyMachineSignature(publicKeySpkiB64: string, canonicalPayload: string, signatureB64: string): boolean {
  try {
    const pubKey = crypto.createPublicKey({
      key: Buffer.from(publicKeySpkiB64, 'base64'),
      format: 'der',
      type: 'spki'
    });
    const data = Buffer.from(canonicalPayload, 'utf8');
    const sig = Buffer.from(signatureB64, 'base64');
    // WebCrypto ECDSA outputs raw 64-byte IEEE P1363 (r || s); also accept ASN.1 DER
    return (
      crypto.verify('sha256', data, { key: pubKey, dsaEncoding: 'ieee-p1363' }, sig) ||
      crypto.verify('sha256', data, pubKey, sig)
    );
  } catch {
    return false;
  }
}

/**
 * Native ApexConnect remote-desktop control plane + device monitoring.
 * ---------------------------------------------------------------------------
 * - POST /session   — broker a native KVM session (see ApexConnectDesktop.tsx)
 * - GET  /nodes     — reachable devices, enriched with RMM health
 * - GET  /thumbnail — server-captured desktop screenshot (JPEG), cached
 * - GET  /health    — engine status
 */

const router = Router();
router.use(authenticate);

// Match a MeshCentral node to its RMM device:
// 1. Prioritize exact cryptographic node ID bound via signed E2EE heartbeat (`d.meshNodeId` / `store.meshNodes`)
// 2. Fall back to hostname correlation only for unmapped legacy devices
function rmmDeviceForNode(node: MeshNode): ManagedDevice | null {
  for (const d of store.devices.values()) {
    if ((d as any).meshNodeId === node.nodeid || store.meshNodes.get(d.id) === node.nodeid) {
      return d;
    }
  }
  const names = [node.name, node.rname].map((s) => (s || '').toLowerCase());
  const bare = names.map((s) => s.split('.')[0]);
  for (const d of store.devices.values()) {
    // Do not cross-bind a device that already bound a different cryptographic meshNodeId
    if ((d as any).meshNodeId && (d as any).meshNodeId !== node.nodeid) continue;
    const cands = [d.hostname, d.name].filter(Boolean).map((x) => (x as string).toLowerCase());
    if (cands.some((c) => names.includes(c) || bare.includes(c.split('.')[0]))) return d;
  }
  return null;
}

// Resolve a target nodeid from an explicit nodeid or a console deviceId.
function resolveNodeId(deviceId: string, explicit: string): string {
  if (explicit) return explicit;
  if (!deviceId) return '';
  const mapped = store.meshNodes.get(deviceId);
  const mappedNode = mapped ? meshClient.getNode(mapped) : null;
  if (mapped && mappedNode?.online) return mapped;
  const device = store.devices.get(deviceId);
  if (device) {
    const node = meshClient.resolveNode([device.hostname, device.name].filter(Boolean) as string[]);
    if (node) { store.meshNodes.set(deviceId, node.nodeid); return node.nodeid; }
  }
  return mapped || '';
}

router.get('/health', (_req: AuthenticatedRequest, res) => {
  res.json(meshClient.status());
});

// GET /api/v1/mesh/nodes — reachable devices + RMM health + thumbnail freshness
router.get('/nodes', async (_req: AuthenticatedRequest, res) => {
  if (!meshClient.configured()) { res.json({ configured: false, connected: false, nodes: [] }); return; }
  try { await meshClient.ensureReady(); }
  catch (err) {
    res.json({ configured: true, connected: false, error: err instanceof Error ? err.message : 'not ready', nodes: [] });
    return;
  }
  const now = Date.now();
  const nodes = await Promise.all(meshClient.listNodes().map(async (n) => {
    const d = rmmDeviceForNode(n);
    const explicit = store.meshNodeClients.get(n.nodeid);
    const thumb = meshClient.getThumb(n.nodeid);
    // Pull hardware telemetry from MeshCentral (stored inventory — available even
    // without the RMM agent AND even when the device is currently offline).
    const telemetry = await meshClient.getTelemetry(n.nodeid);
    // Fused per-agent status so the console can show both channels and repair the
    // down one. RMM is "online" if it heartbeat recently; Mesh from the live conn.
    const rmmLast = d?.metrics?.lastSeen ? Date.parse(d.metrics.lastSeen) : 0;
    const rmmState = !d ? 'absent' : (rmmLast && now - rmmLast < RMM_STALE_MS ? 'online' : 'offline');
    return {
      nodeid: n.nodeid,
      name: n.name,
      rname: n.rname,
      host: n.host,
      online: n.online,
      deviceId: d?.id || null,
      // Identity: RMM device's client wins; else an explicit operator assignment; else unassigned.
      clientId: d?.clientId || explicit?.clientId || null,
      clientName: d?.clientName || explicit?.clientName || '',
      assigned: !!(d?.clientId || explicit?.clientId),
      os: d?.os || (telemetry?.os ? (/windows/i.test(telemetry.os) ? 'windows' : 'macos') : (n.rname && n.rname !== n.name ? 'windows' : 'macos')),
      serial: d?.serialNumber || telemetry?.serial || '',
      health: d
        ? {
            status: d.health,
            cpu: d.metrics?.cpuUsage ?? null,
            ram: d.metrics?.ramUsage ?? null,
            disk: d.metrics?.diskUsage ?? null,
            uptimeDays: d.metrics?.uptimeDays ?? null,
            lastSeen: d.metrics?.lastSeen ?? null
          }
        : null,
      telemetry,
      agents: {
        rmm: { state: rmmState, lastSeen: d?.metrics?.lastSeen ?? null },
        mesh: { state: n.online ? 'online' : 'offline' }
      },
      thumbAt: thumb ? thumb.ts : null
    };
  }));
  res.json({ configured: true, connected: true, nodes });
});

// PATCH /api/v1/mesh/nodes/:nodeid/client — assign a mesh node to a client org
// (for nodes with no RMM agent to infer the client from). Body: { clientId } or
// { clientId: '' | 'none' } to clear the assignment.
router.patch('/nodes/:nodeid/client', (req: AuthenticatedRequest, res) => {
  const nodeid = String(req.params.nodeid);
  const clientId = typeof req.body?.clientId === 'string' ? req.body.clientId : '';
  if (!clientId || clientId === 'none') {
    store.meshNodeClients.delete(nodeid);
    store.recordAudit({
      orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name,
      action: 'mesh.unassign_client', targetType: 'device', targetId: nodeid, details: {}, ipAddress: req.ip
    });
    res.json({ ok: true, nodeid, clientId: null, clientName: '' });
    return;
  }
  const client = store.clients.get(clientId);
  if (!client) { res.status(404).json({ error: 'Client not found' }); return; }
  store.meshNodeClients.set(nodeid, { clientId, clientName: client.name });
  store.recordAudit({
    orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name,
    action: 'mesh.assign_client', targetType: 'device', targetId: nodeid,
    details: { clientId, clientName: client.name }, ipAddress: req.ip
  });
  res.json({ ok: true, nodeid, clientId, clientName: client.name });
});

// POST /api/v1/mesh/nodes/:nodeid/repair — manually repair a sibling agent.
// Body: { agent: 'rmm' | 'mesh' } — 'rmm' restarts the RMM agent via MeshCentral;
// 'mesh' enqueues an RMM command to restart the Mesh agent.
router.post('/nodes/:nodeid/repair', async (req: AuthenticatedRequest, res) => {
  if (!meshClient.configured()) { res.status(503).json({ error: 'Remote engine not configured' }); return; }
  const agent = req.body?.agent as HealAgent;
  if (agent !== 'rmm' && agent !== 'mesh') { res.status(400).json({ error: "agent must be 'rmm' or 'mesh'" }); return; }
  try { await meshClient.ensureReady(); } catch { res.status(502).json({ error: 'remote engine unreachable' }); return; }
  const nodeid = String(req.params.nodeid);
  const result = await repairAgent(nodeid, agent);
  store.recordAudit({
    orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name,
    action: 'agent.heal_manual', targetType: 'device', targetId: nodeid,
    details: { agent, ok: result.ok }, ipAddress: req.ip
  });
  res.status(result.ok ? 200 : 409).json(result);
});

// ---------------------------------------------------------------------------
// Zero-Trust Cryptographic Machine Handshake (ECDSA P-256 + ECDH P-256)
// ---------------------------------------------------------------------------

// GET /api/v1/mesh/machines — list trusted operator machines + strict lock policy
router.get('/machines', (req: AuthenticatedRequest, res) => {
  const machines = Array.from(store.trustedMachines.values()).sort(
    (a, b) => Date.parse(b.lastHandshakeAt || b.enrolledAt) - Date.parse(a.lastHandshakeAt || a.enrolledAt)
  );
  res.json({
    machines,
    policy: {
      enforceStrictLock: store.machineHandshakeConfig.enforceStrictLock,
      enrollmentPin: req.user?.role === 'owner' || req.user?.role === 'admin'
        ? store.machineHandshakeConfig.enrollmentPin
        : undefined,
      updatedAt: store.machineHandshakeConfig.updatedAt,
      updatedBy: store.machineHandshakeConfig.updatedBy
    }
  });
});

// POST /api/v1/mesh/machines/enroll — register an operator workstation's non-exportable ECDSA P-256 public key
router.post('/machines/enroll', (req: AuthenticatedRequest, res) => {
  const machineId = typeof req.body?.machineId === 'string' ? req.body.machineId.trim() : '';
  const publicKeySpkiB64 = typeof req.body?.publicKeySpkiB64 === 'string' ? req.body.publicKeySpkiB64.trim() : '';
  const name = typeof req.body?.name === 'string' && req.body.name.trim()
    ? req.body.name.trim()
    : `${req.user!.name}'s Workstation`;
  const platform = typeof req.body?.platform === 'string' ? req.body.platform : 'Unknown OS';
  const enrollmentPin = typeof req.body?.enrollmentPin === 'string' ? req.body.enrollmentPin.trim() : '';

  if (!machineId || !publicKeySpkiB64) {
    res.status(400).json({ error: 'machineId and publicKeySpkiB64 are required' });
    return;
  }

  // Validate SPKI public key is a valid EC public key
  let fingerprintSha256 = '';
  try {
    const pubKey = crypto.createPublicKey({
      key: Buffer.from(publicKeySpkiB64, 'base64'),
      format: 'der',
      type: 'spki'
    });
    if (pubKey.asymmetricKeyType !== 'ec') {
      res.status(400).json({ error: 'Public key must be an ECDSA P-256 key' });
      return;
    }
    fingerprintSha256 = computeSpkiFingerprint(publicKeySpkiB64);
  } catch {
    res.status(400).json({ error: 'Invalid SPKI public key format' });
    return;
  }

  const existing = store.trustedMachines.get(machineId);
  if (existing && existing.status === 'active' && existing.publicKeySpkiB64 === publicKeySpkiB64) {
    existing.lastIp = req.ip || existing.lastIp;
    store.trustedMachines.set(machineId, existing);
    res.json({ ok: true, machine: existing, alreadyEnrolled: true });
    return;
  }

  const activeMachines = Array.from(store.trustedMachines.values()).filter((m) => m.status === 'active');
  if (store.machineHandshakeConfig.enforceStrictLock && activeMachines.length > 0) {
    if (!enrollmentPin || enrollmentPin.toUpperCase() !== store.machineHandshakeConfig.enrollmentPin.toUpperCase()) {
      res.status(403).json({
        error: 'Strict Machine Lock is active. Enter the Owner Enrollment PIN from an already-trusted machine to authorize this workstation.',
        code: 'STRICT_LOCK_PIN_REQUIRED'
      });
      return;
    }
  }

  const nowIso = new Date().toISOString();
  const machine: TrustedOperatorMachine = {
    id: machineId,
    name,
    operatorId: req.user!.id,
    operatorEmail: req.user!.email,
    operatorName: req.user!.name,
    publicKeySpkiB64,
    fingerprintSha256,
    platform,
    userAgent: String(req.headers['user-agent'] || '').slice(0, 180),
    lastIp: req.ip || 'unknown',
    status: 'active',
    enrolledAt: existing?.enrolledAt || nowIso,
    lastHandshakeAt: existing?.lastHandshakeAt || null,
    handshakeCount: existing?.handshakeCount || 0
  };

  store.trustedMachines.set(machineId, machine);
  store.persist();

  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'remote.machine_enrolled',
    targetType: 'system',
    targetId: machineId,
    details: { name: machine.name, fingerprintSha256, platform },
    ipAddress: req.ip
  });

  res.json({ ok: true, machine });
});

// PATCH /api/v1/mesh/machines/policy — toggle enforceStrictLock or rotate enrollmentPin
router.patch('/machines/policy', (req: AuthenticatedRequest, res) => {
  if (typeof req.body?.enforceStrictLock === 'boolean') {
    const activeCount = Array.from(store.trustedMachines.values()).filter((m) => m.status === 'active').length;
    if (req.body.enforceStrictLock && activeCount === 0) {
      res.status(400).json({ error: 'Enroll your current workstation first before enabling Strict Machine Lock.' });
      return;
    }
    store.machineHandshakeConfig.enforceStrictLock = req.body.enforceStrictLock;
  }
  if (req.body?.rotatePin === true) {
    store.machineHandshakeConfig.enrollmentPin =
      'APEX-' +
      Math.random().toString(36).substring(2, 6).toUpperCase() +
      '-' +
      Math.random().toString(36).substring(2, 6).toUpperCase();
  }
  store.machineHandshakeConfig.updatedAt = new Date().toISOString();
  store.machineHandshakeConfig.updatedBy = req.user!.email;
  store.persist();

  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'remote.machine_policy_update',
    targetType: 'system',
    targetId: 'machine-handshake-policy',
    details: { enforceStrictLock: store.machineHandshakeConfig.enforceStrictLock },
    ipAddress: req.ip
  });

  res.json({ ok: true, policy: store.machineHandshakeConfig });
});

// DELETE /api/v1/mesh/machines/:id — revoke or remove a trusted operator machine
router.delete('/machines/:id', (req: AuthenticatedRequest, res) => {
  const id = String(req.params.id);
  const m = store.trustedMachines.get(id);
  if (!m) {
    res.status(404).json({ error: 'Trusted machine not found' });
    return;
  }
  store.trustedMachines.delete(id);
  // If no active machines remain, automatically disable strict lock so the owner isn't locked out
  const remainingActive = Array.from(store.trustedMachines.values()).filter((x) => x.status === 'active').length;
  if (remainingActive === 0) {
    store.machineHandshakeConfig.enforceStrictLock = false;
  }
  store.persist();

  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'remote.machine_revoked',
    targetType: 'system',
    targetId: id,
    details: { name: m.name, fingerprintSha256: m.fingerprintSha256 },
    ipAddress: req.ip
  });

  res.json({ ok: true, id, enforceStrictLock: store.machineHandshakeConfig.enforceStrictLock });
});

// POST /api/v1/mesh/handshake/challenge — issue a single-use cryptographic challenge + ephemeral ECDH P-256 key
router.post('/handshake/challenge', (req: AuthenticatedRequest, res) => {
  const machineId = typeof req.body?.machineId === 'string' ? req.body.machineId.trim() : '';
  const targetId = typeof req.body?.targetId === 'string' ? req.body.targetId.trim() : 'any';
  if (!machineId) {
    res.status(400).json({ error: 'machineId is required for cryptographic handshake challenge' });
    return;
  }

  // Prune expired challenges
  const now = Date.now();
  for (const [cid, ch] of pendingChallenges.entries()) {
    if (ch.expiresAt < now) pendingChallenges.delete(cid);
  }

  const machine = store.trustedMachines.get(machineId);
  const activeCount = Array.from(store.trustedMachines.values()).filter((m) => m.status === 'active').length;
  if ((!machine || machine.status !== 'active') && store.machineHandshakeConfig.enforceStrictLock && activeCount > 0) {
    res.status(403).json({
      error: 'Untrusted Operator Machine: This computer is not enrolled in the Trusted Machine Registry and Strict Machine Lock is active.',
      code: 'MACHINE_NOT_ENROLLED',
      strictLock: true
    });
    return;
  }

  const challengeId = 'chk-' + crypto.randomBytes(12).toString('hex');
  const challengeNonce = crypto.randomBytes(32).toString('hex');
  const ecdhPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const serverEcdhPubSpkiB64 = (ecdhPair.publicKey.export({ type: 'spki', format: 'der' }) as Buffer).toString('base64');

  pendingChallenges.set(challengeId, {
    challengeId,
    challengeNonce,
    machineId,
    targetId,
    operatorId: req.user!.id,
    serverEcdhPrivateKey: ecdhPair.privateKey,
    serverEcdhPubSpkiB64,
    expiresAt: now + HANDSHAKE_TTL_MS
  });

  res.json({
    challengeId,
    challengeNonce,
    serverEcdhPubSpkiB64,
    expiresAt: new Date(now + HANDSHAKE_TTL_MS).toISOString(),
    enrolled: !!(machine && machine.status === 'active'),
    strictLock: store.machineHandshakeConfig.enforceStrictLock
  });
});

// POST /api/v1/mesh/session — start a native remote-desktop session (requires cryptographic machine handshake when enrolled/locked)
router.post('/session', async (req: AuthenticatedRequest, res) => {
  if (!meshClient.configured()) { res.status(503).json({ error: 'ApexConnect remote engine not configured' }); return; }
  const deviceId = typeof req.body?.deviceId === 'string' ? req.body.deviceId : '';
  const explicit = typeof req.body?.nodeid === 'string' ? req.body.nodeid : '';
  try { await meshClient.ensureReady(); }
  catch (err) { res.status(502).json({ error: err instanceof Error ? err.message : 'remote engine unreachable' }); return; }

  const nodeid = resolveNodeId(deviceId, explicit);
  if (!nodeid) {
    res.status(404).json({ error: 'No ApexConnect agent found for this device. Install/enroll the agent.' });
    return;
  }
  const protocol = typeof req.body?.protocol === 'number' ? req.body.protocol : 2;
  const node = meshClient.getNode(nodeid);
  const device = deviceId ? store.devices.get(deviceId) : undefined;
  const deviceName = device?.name || node?.name || node?.rname || nodeid;
  if (node && !node.online) {
    const lastSeen = device?.metrics?.lastSeen
      ? new Date(device.metrics.lastSeen).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
      : 'unknown';
    res.status(503).json({
      error: `Device "${deviceName}" is currently offline (last seen ${lastSeen}). Power on or wake the computer to connect Backstage.`,
      online: false
    });
    return;
  }

  // ---- Verify Cryptographic Machine Handshake ----
  const hs = req.body?.handshake as {
    machineId?: string;
    challengeId?: string;
    timestamp?: number;
    signatureB64?: string;
    clientEcdhPubSpkiB64?: string;
  } | undefined;

  const activeMachines = Array.from(store.trustedMachines.values()).filter((m) => m.status === 'active');
  let verifiedHandshake: {
    verified: boolean;
    machineId: string;
    machineName: string;
    fingerprintSha256: string;
    sessionCipher: string;
    handshakeProof: string;
    strictLock: boolean;
  } | null = null;

  if (hs && hs.machineId && hs.challengeId && hs.signatureB64) {
    const challenge = pendingChallenges.get(hs.challengeId);
    pendingChallenges.delete(hs.challengeId); // single-use challenge consumption

    if (!challenge || challenge.expiresAt < Date.now() || challenge.machineId !== hs.machineId) {
      res.status(403).json({
        error: 'Cryptographic Machine Handshake expired or invalid challenge nonce. Re-initiating handshake…',
        code: 'HANDSHAKE_CHALLENGE_INVALID'
      });
      return;
    }

    const machine = store.trustedMachines.get(hs.machineId);
    if (!machine || machine.status !== 'active') {
      res.status(403).json({
        error: 'Untrusted Operator Machine: This workstation is not enrolled or has been revoked.',
        code: 'MACHINE_UNTRUSTED'
      });
      return;
    }

    const targetKey = deviceId || explicit || nodeid;
    const canonical = `apexmsp-handshake-v1:${challenge.challengeId}:${challenge.challengeNonce}:${targetKey}:${hs.timestamp || 0}:${hs.clientEcdhPubSpkiB64 || ''}`;
    const sigOk = verifyMachineSignature(machine.publicKeySpkiB64, canonical, hs.signatureB64);
    if (!sigOk) {
      store.recordAudit({
        orgId: req.user!.orgId,
        userId: req.user!.id,
        actorName: req.user!.name,
        action: 'remote.handshake_failed',
        targetType: 'device',
        targetId: deviceId || nodeid,
        details: { machineId: hs.machineId, reason: 'ECDSA_P256_SIGNATURE_MISMATCH', deviceName },
        ipAddress: req.ip
      });
      res.status(403).json({
        error: 'Cryptographic Machine Handshake failed: ECDSA P-256 hardware key signature verification failed.',
        code: 'HANDSHAKE_SIGNATURE_INVALID'
      });
      return;
    }

    // Derive mutual ECDH P-256 session proof
    let handshakeProof = crypto
      .createHash('sha256')
      .update(`${challenge.challengeNonce}:${machine.fingerprintSha256}`)
      .digest('hex')
      .slice(0, 16)
      .toUpperCase();

    if (hs.clientEcdhPubSpkiB64) {
      try {
        const clientEcdhPub = crypto.createPublicKey({
          key: Buffer.from(hs.clientEcdhPubSpkiB64, 'base64'),
          format: 'der',
          type: 'spki'
        });
        const sharedSecret = crypto.diffieHellman({
          privateKey: challenge.serverEcdhPrivateKey,
          publicKey: clientEcdhPub
        });
        handshakeProof = crypto
          .createHash('sha256')
          .update(Buffer.concat([sharedSecret, Buffer.from(challenge.challengeNonce, 'utf8')]))
          .digest('hex')
          .slice(0, 16)
          .toUpperCase();
      } catch {
        // Fallback proof already computed
      }
    }

    machine.lastHandshakeAt = new Date().toISOString();
    machine.lastIp = req.ip || machine.lastIp;
    machine.handshakeCount = (machine.handshakeCount || 0) + 1;
    store.trustedMachines.set(machine.id, machine);

    verifiedHandshake = {
      verified: true,
      machineId: machine.id,
      machineName: machine.name,
      fingerprintSha256: machine.fingerprintSha256,
      sessionCipher: 'ECDSA-P256 + ECDH-P256-SHA256',
      handshakeProof,
      strictLock: store.machineHandshakeConfig.enforceStrictLock
    };
  } else if (store.machineHandshakeConfig.enforceStrictLock && activeMachines.length > 0) {
    store.recordAudit({
      orgId: req.user!.orgId,
      userId: req.user!.id,
      actorName: req.user!.name,
      action: 'remote.handshake_blocked',
      targetType: 'device',
      targetId: deviceId || nodeid,
      details: { reason: 'MISSING_MACHINE_HANDSHAKE', deviceName },
      ipAddress: req.ip
    });
    res.status(403).json({
      error: 'Untrusted Operator Machine: Cryptographic Machine Handshake is required to connect to client devices.',
      code: 'HANDSHAKE_REQUIRED'
    });
    return;
  }

  try {
    const session = await meshClient.openDesktopSession(nodeid, protocol);
    store.recordAudit({
      orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name,
      action: protocol === 2 ? 'remote.desktop_start' : protocol === 6 ? 'remote.powershell_start' : protocol === 5 ? 'remote.files_start' : 'remote.terminal_start',
      targetType: 'device', targetId: deviceId || nodeid,
      details: {
        nodeid,
        transport: 'apexconnect-native',
        deviceName,
        protocol,
        machineHandshake: verifiedHandshake
          ? {
              verified: true,
              machineId: verifiedHandshake.machineId,
              machineName: verifiedHandshake.machineName,
              fingerprintSha256: verifiedHandshake.fingerprintSha256,
              handshakeProof: verifiedHandshake.handshakeProof
            }
          : { verified: false }
      },
      ipAddress: req.ip
    });
    res.json({
      ...session,
      deviceName,
      online: node ? node.online : true,
      handshake: verifiedHandshake
    });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'failed to open remote session' });
  }
});

// GET /api/v1/mesh/thumbnail?nodeid=..|deviceId=..&maxAge=<sec>&refresh=1
router.get('/thumbnail', async (req: AuthenticatedRequest, res) => {
  if (!meshClient.configured()) { res.status(503).end(); return; }
  try { await meshClient.ensureReady(); } catch { res.status(502).end(); return; }
  const nodeid = resolveNodeId(
    typeof req.query.deviceId === 'string' ? req.query.deviceId : '',
    typeof req.query.nodeid === 'string' ? req.query.nodeid : ''
  );
  if (!nodeid) { res.status(404).end(); return; }
  const maxAge = Math.max(30, parseInt(String(req.query.maxAge || '300'), 10) || 300) * 1000;
  const force = req.query.refresh === '1';

  let entry = meshClient.getThumb(nodeid);
  if (force || !entry || Date.now() - entry.ts > maxAge) {
    entry = await meshClient.captureThumbnail(nodeid);
  }
  if (!entry) { res.status(204).end(); return; }
  res.setHeader('content-type', 'image/jpeg');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-captured-at', String(entry.ts));
  res.end(entry.buf);
});

export default router;
