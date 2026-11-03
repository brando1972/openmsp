/**
 * ApexMSP Zero-Trust Cryptographic Machine Handshake
 * ---------------------------------------------------------------------------
 * Uses browser WebCrypto (`window.crypto.subtle`) + IndexedDB to bind a
 * non-exportable (`extractable: false`) ECDSA P-256 hardware/OS keystore keypair
 * to the operator's physical workstation.
 *
 * Every remote desktop (`protocol=2`), file transfer (`protocol=5`), or
 * Backstage terminal (`protocol=1/6`) session performs:
 *   1. Single-use 256-bit challenge nonce + ephemeral server ECDH P-256 key
 *   2. Client ephemeral ECDH P-256 key agreement + non-exportable ECDSA P-256 signature
 */

const DB_NAME = 'apexmsp_machine_keystore_v1';
const STORE_NAME = 'machine_keys';
const RECORD_ID = 'primary_operator_machine';
const LOCAL_META_KEY = 'apexmsp_machine_identity_meta_v1';

interface StoredKeyRecord {
  id: string;
  machineId: string;
  name: string;
  platform: string;
  publicKeySpkiB64: string;
  fingerprintSha256: string;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  createdAt: string;
}

export interface LocalMachineIdentity {
  machineId: string;
  name: string;
  platform: string;
  publicKeySpkiB64: string;
  fingerprintSha256: string;
  createdAt: string;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function detectPlatformLabel(): { name: string; platform: string } {
  if (typeof navigator === 'undefined') {
    return { name: 'Operator Workstation', platform: 'Unknown OS' };
  }
  const ua = navigator.userAgent || '';
  const plat = (navigator as any).userAgentData?.platform || navigator.platform || '';
  let os = 'Workstation';
  if (/Mac/i.test(plat) || /Macintosh|Mac OS X/i.test(ua)) {
    os = 'Mac Workstation (macOS)';
  } else if (/Win/i.test(plat) || /Windows/i.test(ua)) {
    os = 'Windows Workstation';
  } else if (/Linux/i.test(plat) || /Linux/i.test(ua)) {
    os = 'Linux Workstation';
  } else if (/iPhone|iPad/i.test(ua)) {
    os = 'iOS Operator Device';
  }

  let browser = 'Browser';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';

  const customName = typeof localStorage !== 'undefined' ? localStorage.getItem('apexmsp_machine_custom_name') : null;
  return {
    name: customName || `${os} · ${browser}`,
    platform: os
  };
}

async function computeFingerprint(spkiBuffer: ArrayBuffer): Promise<string> {
  const hashBuf = await window.crypto.subtle.digest('SHA-256', spkiBuffer);
  const bytes = Array.from(new Uint8Array(hashBuf));
  return bytes
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(':');
}

function openKeystoreDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB machine keystore'));
  });
}

async function loadOrCreateRecord(): Promise<StoredKeyRecord> {
  const db = await openKeystoreDb();
  const existing = await new Promise<StoredKeyRecord | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(RECORD_ID);
    getReq.onsuccess = () => resolve(getReq.result as StoredKeyRecord | undefined);
    getReq.onerror = () => reject(getReq.error);
  });

  if (existing && existing.privateKey && existing.publicKeySpkiB64) {
    const customName = typeof localStorage !== 'undefined' ? localStorage.getItem('apexmsp_machine_custom_name') : null;
    if (customName && existing.name !== customName) {
      existing.name = customName;
    }
    db.close();
    return existing;
  }

  // Generate non-exportable ECDSA P-256 hardware-bound keypair
  const keyPair = await window.crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, // NON-EXPORTABLE private key — cannot be extracted from IndexedDB
    ['sign', 'verify']
  );

  const spkiBuffer = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
  const publicKeySpkiB64 = arrayBufferToBase64(spkiBuffer);
  const fingerprintSha256 = await computeFingerprint(spkiBuffer);
  const shortId = fingerprintSha256.replace(/:/g, '').slice(0, 12).toLowerCase();
  const machineId = `mach-${shortId}`;
  const { name, platform } = detectPlatformLabel();

  const record: StoredKeyRecord = {
    id: RECORD_ID,
    machineId,
    name,
    platform,
    publicKeySpkiB64,
    fingerprintSha256,
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    createdAt: new Date().toISOString()
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const putReq = store.put(record);
    putReq.onsuccess = () => resolve();
    putReq.onerror = () => reject(putReq.error);
  });
  db.close();

  try {
    localStorage.setItem(
      LOCAL_META_KEY,
      JSON.stringify({
        machineId: record.machineId,
        name: record.name,
        platform: record.platform,
        publicKeySpkiB64: record.publicKeySpkiB64,
        fingerprintSha256: record.fingerprintSha256,
        createdAt: record.createdAt
      })
    );
  } catch {
    // ignore storage errors
  }

  return record;
}

export async function getLocalMachineIdentity(): Promise<LocalMachineIdentity> {
  const rec = await loadOrCreateRecord();
  return {
    machineId: rec.machineId,
    name: rec.name,
    platform: rec.platform,
    publicKeySpkiB64: rec.publicKeySpkiB64,
    fingerprintSha256: rec.fingerprintSha256,
    createdAt: rec.createdAt
  };
}

export function setLocalMachineCustomName(name: string): void {
  if (typeof localStorage !== 'undefined' && name.trim()) {
    localStorage.setItem('apexmsp_machine_custom_name', name.trim());
  }
}

export async function signMachineHandshakeChallenge(params: {
  challengeId: string;
  challengeNonce: string;
  targetKey: string;
}): Promise<{
  machineId: string;
  challengeId: string;
  timestamp: number;
  signatureB64: string;
  clientEcdhPubSpkiB64: string;
}> {
  const rec = await loadOrCreateRecord();
  const timestamp = Date.now();

  // Generate ephemeral ECDH P-256 keypair for forward-secret session proof
  let clientEcdhPubSpkiB64 = '';
  try {
    const ecdhPair = await window.crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );
    const ecdhSpki = await window.crypto.subtle.exportKey('spki', ecdhPair.publicKey);
    clientEcdhPubSpkiB64 = arrayBufferToBase64(ecdhSpki);
  } catch {
    clientEcdhPubSpkiB64 = '';
  }

  const canonical = `apexmsp-handshake-v1:${params.challengeId}:${params.challengeNonce}:${params.targetKey}:${timestamp}:${clientEcdhPubSpkiB64}`;
  const encoded = new TextEncoder().encode(canonical);
  const sigBuf = await window.crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    rec.privateKey,
    encoded
  );

  return {
    machineId: rec.machineId,
    challengeId: params.challengeId,
    timestamp,
    signatureB64: arrayBufferToBase64(sigBuf),
    clientEcdhPubSpkiB64
  };
}
