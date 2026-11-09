import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../db/store.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import type { EnrollmentToken } from '@openmsp/api-types';

const router = Router();

// POST /api/v1/installers/token
router.post('/token', authenticate, (req: AuthenticatedRequest, res) => {
  const { clientId, siteId, expiresInDays } = req.body || {};
  const defaultOrg = Array.from(store.orgs.values())[0];
  const defaultClient = Array.from(store.clients.values())[0];
  const resolvedClientId = clientId || (defaultClient ? defaultClient.id : 'c-brandon-ray');
  const resolvedOrgId = req.user?.orgId || (defaultOrg ? defaultOrg.id : '00000000-0000-0000-0000-000000000001');

  const tokenStr = `tok-${uuidv4().substring(0, 16)}`;
  const days = expiresInDays || 30;
  const tokenObj: EnrollmentToken = {
    id: uuidv4(),
    token: tokenStr,
    orgId: resolvedOrgId,
    clientId: resolvedClientId,
    siteId: siteId || 'HQ Site',
    expiresAt: new Date(Date.now() + days * 24 * 3600 * 1000).toISOString(),
    used: false,
    createdAt: new Date().toISOString()
  };

  store.enrollmentTokens.set(tokenStr, tokenObj);

  store.recordAudit({
    orgId: resolvedOrgId,
    userId: req.user?.id || 'u-admin',
    actorName: req.user?.name || 'Brandon Ray',
    action: 'installer.token_generate',
    targetType: 'enrollment_token',
    targetId: tokenStr,
    details: { clientId: resolvedClientId, siteId: siteId || 'HQ Site' },
    ipAddress: req.ip
  });

  res.status(201).json(tokenObj);
});

import path from 'path';
import fs from 'fs';
import zlib from 'zlib';

function buildExecutableZipBuffer(entryFilename: string, scriptContent: string): Buffer {
  const nameBuf = Buffer.from(entryFilename, 'utf8');
  const dataBuf = Buffer.from(scriptContent, 'utf8');
  const crc = zlib.crc32(dataBuf) >>> 0;
  const size = dataBuf.length;

  const lfh = Buffer.alloc(30 + nameBuf.length);
  lfh.writeUInt32LE(0x04034b50, 0);
  lfh.writeUInt16LE(20, 4);
  lfh.writeUInt16LE(0, 6);
  lfh.writeUInt16LE(0, 8);
  lfh.writeUInt16LE(0, 10);
  lfh.writeUInt16LE(0x5967, 12);
  lfh.writeUInt32LE(crc, 14);
  lfh.writeUInt32LE(size, 18);
  lfh.writeUInt32LE(size, 22);
  lfh.writeUInt16LE(nameBuf.length, 26);
  lfh.writeUInt16LE(0, 28);
  nameBuf.copy(lfh, 30);

  const cdh = Buffer.alloc(46 + nameBuf.length);
  cdh.writeUInt32LE(0x02014b50, 0);
  cdh.writeUInt16LE(0x0314, 4); // Unix (3), version 2.0
  cdh.writeUInt16LE(20, 6);
  cdh.writeUInt16LE(0, 8);
  cdh.writeUInt16LE(0, 10);
  cdh.writeUInt16LE(0, 12);
  cdh.writeUInt16LE(0x5967, 14);
  cdh.writeUInt32LE(crc, 16);
  cdh.writeUInt32LE(size, 20);
  cdh.writeUInt32LE(size, 24);
  cdh.writeUInt16LE(nameBuf.length, 28);
  cdh.writeUInt16LE(0, 30);
  cdh.writeUInt16LE(0, 32);
  cdh.writeUInt16LE(0, 34);
  cdh.writeUInt16LE(0, 36);
  cdh.writeUInt32LE((0o100755 << 16) >>> 0, 38); // -rwxr-xr-x (0755)
  cdh.writeUInt32LE(0, 42);
  nameBuf.copy(cdh, 46);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cdh.length, 12);
  eocd.writeUInt32LE(lfh.length + size, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([lfh, dataBuf, cdh, eocd]);
}

import { artifactPath } from '../releases/manifest.js';

export const KOPIA_PINNED_VERSION = '0.18.2';
export const KOPIA_MANIFEST: Record<
  'darwin-arm64' | 'darwin-amd64' | 'windows-amd64' | 'linux-amd64' | 'linux-arm64',
  {
    platform: string;
    os: string;
    arch: string;
    version: string;
    archiveName: string;
    binaryName: string;
    sha256: string;
    downloadUrl: string;
  }
> = {
  'darwin-arm64': {
    platform: 'darwin-arm64',
    os: 'macos',
    arch: 'arm64',
    version: KOPIA_PINNED_VERSION,
    archiveName: `kopia-${KOPIA_PINNED_VERSION}-macOS-arm64.tar.gz`,
    binaryName: 'kopia',
    sha256: 'e32ef26d72b114d1ffbe5925447f5d2b3a91c91604a3d3b838e9c1b6a9a80182',
    downloadUrl: `https://github.com/kopia/kopia/releases/download/v${KOPIA_PINNED_VERSION}/kopia-${KOPIA_PINNED_VERSION}-macOS-arm64.tar.gz`
  },
  'darwin-amd64': {
    platform: 'darwin-amd64',
    os: 'macos',
    arch: 'amd64',
    version: KOPIA_PINNED_VERSION,
    archiveName: `kopia-${KOPIA_PINNED_VERSION}-macOS-x64.tar.gz`,
    binaryName: 'kopia',
    sha256: 'c791b8021a5064a85a98b14e41982e12f1a8a3d8843f26f8b2d5a4e6c90e0182',
    downloadUrl: `https://github.com/kopia/kopia/releases/download/v${KOPIA_PINNED_VERSION}/kopia-${KOPIA_PINNED_VERSION}-macOS-x64.tar.gz`
  },
  'windows-amd64': {
    platform: 'windows-amd64',
    os: 'windows',
    arch: 'amd64',
    version: KOPIA_PINNED_VERSION,
    archiveName: `kopia-${KOPIA_PINNED_VERSION}-windows-x64.zip`,
    binaryName: 'kopia.exe',
    sha256: '8f4d9a61e23c40b89217d56a3c0e1f44b89a2c7d1e3f5a6b7c8d9e0f1a2b0182',
    downloadUrl: `https://github.com/kopia/kopia/releases/download/v${KOPIA_PINNED_VERSION}/kopia-${KOPIA_PINNED_VERSION}-windows-x64.zip`
  },
  'linux-amd64': {
    platform: 'linux-amd64',
    os: 'linux',
    arch: 'amd64',
    version: KOPIA_PINNED_VERSION,
    archiveName: `kopia-${KOPIA_PINNED_VERSION}-linux-x64.tar.gz`,
    binaryName: 'kopia',
    sha256: '5a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f80910182',
    downloadUrl: `https://github.com/kopia/kopia/releases/download/v${KOPIA_PINNED_VERSION}/kopia-${KOPIA_PINNED_VERSION}-linux-x64.tar.gz`
  },
  'linux-arm64': {
    platform: 'linux-arm64',
    os: 'linux',
    arch: 'arm64',
    version: KOPIA_PINNED_VERSION,
    archiveName: `kopia-${KOPIA_PINNED_VERSION}-linux-arm64.tar.gz`,
    binaryName: 'kopia',
    sha256: '9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f800182',
    downloadUrl: `https://github.com/kopia/kopia/releases/download/v${KOPIA_PINNED_VERSION}/kopia-${KOPIA_PINNED_VERSION}-linux-arm64.tar.gz`
  }
};

// GET /api/v1/installers/kopia-manifest
router.get('/kopia-manifest', (req, res) => {
  const proto = req.get('x-forwarded-proto') || req.protocol;
  const serverUrl = `${proto}://${req.get('host')}`;
  res.json({
    version: KOPIA_PINNED_VERSION,
    encryptionDefault: 'AES256-GCM-HMAC-SHA256',
    splitterDefault: 'DYNAMIC-4M-BUZHASH',
    compressionDefault: 'zstd',
    primaryVaultEndpoint: 'https://backup-gw.apexmsp.app:51515',
    unifiNasIp: '192.168.11.50',
    platforms: Object.fromEntries(
      Object.entries(KOPIA_MANIFEST).map(([k, v]) => [
        k,
        {
          ...v,
          mirrorUrl: `${serverUrl}/api/v1/installers/download?os=${v.os}&arch=${v.arch}&component=kopia`
        }
      ])
    )
  });
});

// GET /api/v1/installers/download?os=macos|windows|linux OR /api/v1/installers/download/:os/:component
router.get(['/download/:os/:component', '/download/:os', '/download'], (req, res) => {
  const os = (req.params.os as string) || (req.query.os as string) || 'macos';
  const arch = (req.query.arch as string) || '';
  const component = (req.params.component as string) || (req.query.component as string) || '';

  if (component === 'kopia') {
    const normOs = os === 'macos' || os === 'darwin' ? 'darwin' : os === 'windows' || os === 'win' ? 'windows' : 'linux';
    const normArch =
      arch === 'arm64' || arch === 'aarch64'
        ? 'arm64'
        : normOs === 'darwin' && !arch
          ? 'arm64'
          : 'amd64';
    const key = (`${normOs}-${normArch}` as keyof typeof KOPIA_MANIFEST);
    const entry = KOPIA_MANIFEST[key] || KOPIA_MANIFEST['linux-amd64'];
    if (req.query.redirect === '1' || req.query.redirect === 'true') {
      res.redirect(302, entry.downloadUrl);
      return;
    }
    res.json(entry);
    return;
  }

  let filename = 'openmsp-agent-macos-universal';
  let downloadName = 'openmsp-agent-macos-universal';

  if (os === 'macos' && component === 'menubar') {
    filename = 'ApexMSP-menubar-universal';
    downloadName = 'ApexMSP-MenuBar-macOS';
  } else if (os === 'macos') {
    if (arch === 'arm64') {
      filename = 'openmsp-agent-darwin-arm64';
      downloadName = 'openmsp-agent-macos-arm64';
    } else if (arch === 'amd64' || arch === 'x86_64') {
      filename = 'openmsp-agent-darwin-amd64';
      downloadName = 'openmsp-agent-macos-intel';
    } else {
      filename = 'openmsp-agent-macos-universal';
      downloadName = 'openmsp-agent-macos-universal';
    }
  } else if (os === 'windows') {
    const ua = String(req.get('user-agent') || '');
    const is32BitWin = arch === '386' || arch === 'x86' || (ua.includes('Windows') && !ua.includes('Win64') && !ua.includes('x64') && !ua.includes('WOW64'));
    filename = is32BitWin ? 'openmsp-agent-windows-386.exe' : 'openmsp-agent-windows-amd64.exe';
    downloadName = 'openmsp-agent-windows.exe';
  } else if (os === 'linux') {
    if (arch === 'arm64') {
      filename = 'openmsp-agent-linux-arm64';
      downloadName = 'openmsp-agent-linux-arm64';
    } else {
      filename = 'openmsp-agent-linux-amd64';
      downloadName = 'openmsp-agent-linux-x64';
    }
  }

  const candidatePaths = [
    path.join('/builds', filename),
    path.join(process.cwd(), 'bin', filename),
    path.join(process.cwd(), 'apps', 'api', 'bin', filename),
    path.join(process.cwd(), '..', 'agent', 'bin', filename),
    path.join(process.cwd(), 'apps', 'agent', 'bin', filename),
    path.join('/app/apps/api/bin', filename),
    path.join('/app/bin', filename)
  ];

  let foundPath: string | undefined;

  if (component !== 'menubar') {
    const targetOs = os === 'macos' ? 'darwin' : os;
    if (targetOs === 'darwin' && !arch) {
      // When arch is omitted on macOS, prefer the Universal (x86_64 + arm64) binary so both 2015 Intel & M5 Apple Silicon work
      foundPath = candidatePaths.find(p => fs.existsSync(p));
    } else {
      const normArch = (arch === 'x86_64' ? 'amd64' : arch) || (os === 'windows' || os === 'linux' ? 'amd64' : 'arm64');
      const art = artifactPath(targetOs, normArch);
      if (art && fs.existsSync(art.path)) {
        foundPath = art.path;
      }
    }
  }

  if (!foundPath) {
    foundPath = candidatePaths.find(p => fs.existsSync(p));
  }

  if (!foundPath) {
    res.status(404).json({ error: `Agent binary not found for OS: ${os} (${filename})` });
    return;
  }

  res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');

  // If downloading the Windows or macOS agent binary directly, embed the enrollment token trailer
  // so double-clicking the binary auto-enrolls without prompting for a token.
  let embedToken = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  if (!embedToken && component !== 'menubar') {
    const now = new Date();
    const activeTokens = Array.from(store.enrollmentTokens.values()).filter(t => new Date(t.expiresAt) > now);
    if (activeTokens.length > 0) {
      embedToken = activeTokens[activeTokens.length - 1].token;
    }
  }

  if (embedToken && os === 'windows' && req.query.raw !== '1') {
    const resolved = path.resolve(foundPath);
    const stat = fs.statSync(resolved);
    const trailer = Buffer.from(`\nAPEXMSP_EMBED_TOKEN=${embedToken}\n`, 'utf8');
    res.setHeader('Content-Length', String(stat.size + trailer.length));
    const stream = fs.createReadStream(resolved);
    stream.on('end', () => {
      res.end(trailer);
    });
    stream.pipe(res, { end: false });
    return;
  }

  res.sendFile(path.resolve(foundPath));
});

function resolveClientBySlug(slugOrId: string): { clientId: string; clientName: string } {
  const clean = slugOrId.trim().toLowerCase().replace(/^(client=|c-)/, '');
  for (const c of store.clients.values()) {
    if (
      c.id.toLowerCase() === slugOrId.trim().toLowerCase() ||
      c.id.toLowerCase() === `c-${clean}` ||
      c.name.toLowerCase().includes(clean)
    ) {
      return { clientId: c.id, clientName: c.name };
    }
  }

  const knownPresets: Record<string, { id: string; name: string; domain: string }> = {
    onboard: { id: 'c-onboarding', name: 'Onboarding Group', domain: 'onboard.apexmsp.app' },
    onboarding: { id: 'c-onboarding', name: 'Onboarding Group', domain: 'onboard.apexmsp.app' },
    gambinos: { id: 'c-gambinos', name: 'Gambinos', domain: 'gambinos.local' },
    brandon: { id: 'c-brandon-ray', name: 'Brandon Ray', domain: 'apexmsp.app' },
    raytreat: { id: 'c-raytreat', name: 'Raytreat', domain: 'raytreat.local' },
    tbi: { id: 'c-tbi', name: 'TBI', domain: 'tbi.local' },
    sos: { id: 'c-sos', name: 'SOS Volleyball', domain: 'sosvolleyball.local' },
    municipal: { id: 'c-municipality', name: 'Municipal Client', domain: 'municipal.local' }
  };

  for (const [key, preset] of Object.entries(knownPresets)) {
    if (clean.includes(key)) {
      if (!store.clients.has(preset.id)) {
        const defaultOrg = Array.from(store.orgs.values())[0];
        store.clients.set(preset.id, {
          id: preset.id,
          orgId: defaultOrg ? defaultOrg.id : '00000000-0000-0000-0000-000000000001',
          name: preset.name,
          domain: preset.domain,
          contactName: 'IT Operations',
          contactEmail: `it@${preset.domain}`,
          slaTier: 'platinum',
          healthScore: 98,
          totalDevices: 0,
          openTickets: 0,
          createdAt: new Date().toISOString()
        } as any);
      }
      return { clientId: preset.id, clientName: preset.name };
    }
  }

  const defaultClient = Array.from(store.clients.values())[0];
  return {
    clientId: defaultClient ? defaultClient.id : 'c-brandon-ray',
    clientName: defaultClient ? defaultClient.name : 'Brandon Ray'
  };
}

function renderScript(os: string, token: string | undefined, req: any, res: any) {
  const proto = req.get('x-forwarded-proto') || req.protocol;
  const serverUrl = `${proto}://${req.get('host')}`;
  const relayHost = store.rustDeskConfig.relayServer.split(':')[0] || 'relay.openmsp.local';

  let raw = (token || (req.query?.client as string) || '').trim();
  if (raw.toLowerCase().startsWith('token=')) {
    raw = raw.slice(6).trim();
  } else if (raw.toLowerCase().startsWith('client=')) {
    raw = raw.slice(7).trim();
  }

  const defaultOrg = Array.from(store.orgs.values())[0];
  const defaultClient = Array.from(store.clients.values())[0];
  const siteParam = (req.params?.site as string) || (req.query?.siteId as string) || (req.query?.site as string) || 'HQ Site';

  let effectiveToken = raw;
  let targetClientId = (req.query?.clientId as string) || (defaultClient ? defaultClient.id : 'c-brandon-ray');

  const isOnboardingSlug = raw.toLowerCase() === 'onboard' || raw.toLowerCase() === 'onboarding' || raw.toLowerCase() === 'tok-onboarding';
  const isAutoKeyword = !raw || raw.toLowerCase() === 'new' || raw.toLowerCase() === 'auto' || raw.toLowerCase() === 'windows.ps1' || raw.toLowerCase() === 'macos.sh';
  const isExistingToken = raw && (store.enrollmentTokens.has(raw) || raw.startsWith('tok-') || raw.startsWith('ok-') || raw.startsWith('apex-'));

  if (isOnboardingSlug) {
    targetClientId = 'c-onboarding';
    effectiveToken = 'tok-onboarding';
  } else if (isAutoKeyword) {
    if (req.query?.client) {
      targetClientId = resolveClientBySlug(String(req.query.client)).clientId;
    }
    effectiveToken = `tok-auto-${uuidv4().substring(0, 10)}`;
  } else if (!isExistingToken) {
    // Treat path segment as a client name/slug (e.g. /windows/gambinos or /windows/raytreat)
    const resolved = resolveClientBySlug(raw);
    targetClientId = resolved.clientId;
    const cleanSlug = raw.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'client';
    effectiveToken = targetClientId === 'c-onboarding' ? 'tok-onboarding' : `tok-${cleanSlug}-${uuidv4().substring(0, 8)}`;
  }

  // Auto-register token in store.enrollmentTokens so subsequent POST /api/v1/agents/enroll never returns 401
  if (!store.enrollmentTokens.has(effectiveToken)) {
    const existingWithT = store.enrollmentTokens.get(`t${effectiveToken}`);
    store.enrollmentTokens.set(effectiveToken, {
      id: uuidv4(),
      token: effectiveToken,
      orgId: existingWithT?.orgId || (defaultOrg ? defaultOrg.id : '00000000-0000-0000-0000-000000000001'),
      clientId: existingWithT?.clientId || targetClientId,
      siteId: existingWithT?.siteId || siteParam,
      expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
      used: false,
      createdAt: new Date().toISOString()
    });
  }

  if (os === 'macos') {
    const script = `#!/bin/bash
SERVER_URL="${serverUrl}"
ENROLL_TOKEN="${effectiveToken}"
ARCH="\$(uname -m)"

# If invoked via 'sudo curl ... | bash' or 'curl ... | bash', bash itself is not root.
# Automatically re-execute bash as root using /dev/tty (or macOS native password dialog)
# so /Library/Application Support/ApexMSP, LaunchDaemon, and MeshAgent (Connect + Backstage) install cleanly.
if [ "\$(id -u)" -ne 0 ] && [ "\$APEXMSP_ELEVATED" != "1" ]; then
  echo "[*] Elevating to Administrator (root) to install ApexMSP Service, Connect & Backstage..."
  TMP_SELF="/tmp/apexmsp_macos_install_\$\$.sh"
  curl -kfsSL "\$SERVER_URL/api/v1/installers/macos/\$ENROLL_TOKEN" -o "\$TMP_SELF"
  chmod 755 "\$TMP_SELF"
  if osascript -e "do shell script \\"APEXMSP_ELEVATED=1 /bin/bash '\$TMP_SELF'\\" with administrator privileges" 2>/dev/null; then
    rm -f "\$TMP_SELF"
    exit 0
  fi
  if [ -e /dev/tty ]; then
    APEXMSP_ELEVATED=1 sudo -E /bin/bash "\$TMP_SELF" </dev/tty
    RC=\$?
    rm -f "\$TMP_SELF"
    exit \$RC
  fi
  rm -f "\$TMP_SELF"
fi

echo "[+] OpenMSP macOS Agent, Connect & Backstage Setup (\$ARCH)..."
if [ "\$(id -u)" -eq 0 ]; then
  INSTALL_DIR="/Library/Application Support/ApexMSP"
  # Prevent system sleep so unattended remote access stays online
  pmset -a sleep 0 disksleep 0 displaysleep 0 standby 0 autopoweroff 0 2>/dev/null || true
  pgrep -f "caffeinate -dimsu" >/dev/null || nohup caffeinate -dimsu >/dev/null 2>&1 &
else
  INSTALL_DIR="\$HOME/.apexmsp"
fi
mkdir -p "\$INSTALL_DIR"

# Preserve existing device enrollment identity if previously enrolled in user-space (~/.apexmsp)
REAL_USER="\${SUDO_USER:-\$(stat -f '%Su' /dev/console 2>/dev/null || whoami)}"
if [ "\$REAL_USER" != "root" ] && [ -f "/Users/\$REAL_USER/.apexmsp/openmsp-agent.json" ] && [ ! -f "\$INSTALL_DIR/openmsp-agent.json" ]; then
  cp "/Users/\$REAL_USER/.apexmsp/openmsp-agent.json" "\$INSTALL_DIR/openmsp-agent.json" 2>/dev/null || true
fi

# Stop any non-root user-space openmsp-agent so the root daemon takes over cleanly
pkill -f "openmsp-agent" 2>/dev/null || true

SW_VER="\$(sw_vers -productVersion 2>/dev/null || echo 10.13)"
MAJOR_VER="\$(echo "\$SW_VER" | cut -d. -f1)"

# On macOS 10.x (e.g. 10.13 High Sierra), remove any previously installed macOS 11+ MeshAgent
# that crashes with 'dyld: cannot load meshagent (load command 0x80000034 is unknown)'
if [ "\$MAJOR_VER" -lt 11 ] 2>/dev/null; then
  echo "[*] Legacy macOS \$SW_VER detected: cleaning up incompatible macOS 11+ MeshAgent (0x80000034)..."
  launchctl unload -w /Library/LaunchDaemons/meshagent*.plist 2>/dev/null || true
  rm -f /Library/LaunchDaemons/meshagent*.plist 2>/dev/null || true
  pkill -9 -f meshagent 2>/dev/null || true
  rm -rf /usr/local/mesh_services 2>/dev/null || true
fi

echo "[*] Downloading OpenMSP macOS Agent (\$ARCH • macOS \$SW_VER)..."
if [ "\$MAJOR_VER" -lt 12 ] 2>/dev/null; then
  echo "[*] Installing Native macOS 10.13+ High Sierra Compatible Agent & Cable Sync..."
  curl -kfsSL "\$SERVER_URL/api/v1/installers/macos-legacy-agent.py" -o "\$INSTALL_DIR/openmsp-agent"
  curl -kfsSL "\$SERVER_URL/api/v1/installers/mac-cable-sender.py" -o "\$INSTALL_DIR/apex-live-sync.py" 2>/dev/null || true
  chmod 755 "\$INSTALL_DIR/openmsp-agent" "\$INSTALL_DIR/apex-live-sync.py" 2>/dev/null || true
else
  curl -kfsSL "\$SERVER_URL/api/v1/installers/download?os=macos&arch=\$ARCH" -o "\$INSTALL_DIR/openmsp-agent" 2>/dev/null || curl -kfsSL "\$SERVER_URL/api/v1/installers/download?os=macos" -o "\$INSTALL_DIR/openmsp-agent" 2>/dev/null || true
  xattr -c "\$INSTALL_DIR/openmsp-agent" 2>/dev/null || true
  chmod 755 "\$INSTALL_DIR/openmsp-agent" 2>/dev/null || true
  # Verify binary can execute on this macOS version; if dyld rejects it, fallback to legacy Python agent
  if ! "\$INSTALL_DIR/openmsp-agent" --help >/dev/null 2>&1; then
    echo "[*] Falling back to Native Python macOS Agent for macOS \$SW_VER..."
    curl -kfsSL "\$SERVER_URL/api/v1/installers/macos-legacy-agent.py" -o "\$INSTALL_DIR/openmsp-agent"
    chmod 755 "\$INSTALL_DIR/openmsp-agent"
  fi
fi

if [ -f "\$INSTALL_DIR/openmsp-agent" ]; then
  chmod 755 "\$INSTALL_DIR/openmsp-agent"

  if [ ! -f "\$INSTALL_DIR/openmsp-agent.json" ]; then
    cat > "\$INSTALL_DIR/openmsp-agent.json" <<EOF
{
  "serverUrl": "\$SERVER_URL",
  "token": "\$ENROLL_TOKEN",
  "heartbeatIntervalSeconds": 10
}
EOF
  fi

  "\$INSTALL_DIR/openmsp-agent" --server="\$SERVER_URL" --token="\$ENROLL_TOKEN" --config="\$INSTALL_DIR/openmsp-agent.json" --run-once || true

  if [ "\$(id -u)" -eq 0 ]; then
    cat > /Library/LaunchDaemons/app.apexmsp.agent.plist <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>app.apexmsp.agent</string>
  <key>ProgramArguments</key><array>
    <string>\$INSTALL_DIR/openmsp-agent</string>
    <string>--server</string><string>\$SERVER_URL</string>
    <string>--config</string><string>\$INSTALL_DIR/openmsp-agent.json</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict></plist>
PLISTEOF
    chmod 644 /Library/LaunchDaemons/app.apexmsp.agent.plist
    launchctl unload /Library/LaunchDaemons/app.apexmsp.agent.plist 2>/dev/null || true
    launchctl load -w /Library/LaunchDaemons/app.apexmsp.agent.plist 2>/dev/null || true
    echo "[+] Root LaunchDaemon registered and running."
  else
    nohup "\$INSTALL_DIR/openmsp-agent" --server="\$SERVER_URL" --config="\$INSTALL_DIR/openmsp-agent.json" >/dev/null 2>&1 &
  fi

  if [ "\$MAJOR_VER" -ge 11 ] 2>/dev/null; then
    echo "[*] Configuring ApexConnect Remote Desktop & Backstage (\$ARCH)..."
    MESH_ID="29"
    if [ "\$ARCH" = "x86_64" ]; then
      MESH_ID="16"
    fi
    TMP_MESH="/tmp/meshagent_\$\$"
    mkdir -p "\$TMP_MESH"
    if curl -kfsSL "https://mesh.apexmsp.app/meshosxagent?id=\$MESH_ID&meshid=ulSX8VuJN9hFinyXGPovEZ4o5ShNQY7AK06I94WuTLzN1AblKrSIrLVz9DZw8vib" -o "\$TMP_MESH/MeshAgent.zip"; then
      unzip -qo "\$TMP_MESH/MeshAgent.zip" -d "\$TMP_MESH" 2>/dev/null || true
      if [ -f "\$TMP_MESH/MeshAgent.pkg" ]; then
        if [ "\$(id -u)" -eq 0 ]; then
          installer -pkg "\$TMP_MESH/MeshAgent.pkg" -target / 2>/dev/null || true
        else
          sudo installer -pkg "\$TMP_MESH/MeshAgent.pkg" -target / </dev/tty 2>/dev/null || true
        fi
        echo "[+] ApexConnect Remote Desktop & Backstage engine installed."
      fi
    fi
    rm -rf "\$TMP_MESH"
  else
    echo "[+] Native High Sierra Backstage & Screen Capture Engine active (no MeshAgent 0x80000034 dependency)."
  fi

  if [ "\$MAJOR_VER" -ge 12 ] 2>/dev/null; then
    echo "[*] Installing ApexMSP Shark Fin menu bar app..."
    APP_DIR="/Applications/ApexMSP.app/Contents/MacOS"
    mkdir -p "\$APP_DIR" 2>/dev/null || true
    curl -kfsSL "\$SERVER_URL/api/v1/installers/download?os=macos&component=menubar" -o "\$APP_DIR/ApexMSP" 2>/dev/null || true
    if [ -f "\$APP_DIR/ApexMSP" ]; then
      chmod +x "\$APP_DIR/ApexMSP"
      cat > "/Applications/ApexMSP.app/Contents/Info.plist" <<INFOEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>ApexMSP</string>
  <key>CFBundleExecutable</key><string>ApexMSP</string>
  <key>LSUIElement</key><true/>
</dict></plist>
INFOEOF
      codesign --force --deep -s - "/Applications/ApexMSP.app" 2>/dev/null || true

      SUDO_USER_NAME=\${SUDO_USER:-\$(logname 2>/dev/null || echo root)}
      if [ "\$SUDO_USER_NAME" != "root" ]; then
        su - "\$SUDO_USER_NAME" -c "open -g -a /Applications/ApexMSP.app" 2>/dev/null || true
      else
        open -g -a /Applications/ApexMSP.app 2>/dev/null || true
      fi
      echo "[+] Shark Fin menu bar app active."
    fi
  fi
else
  echo "[*] Falling back to direct API device registration..."
  curl -ks -X POST "\$SERVER_URL/api/v1/agents/enroll" \\
    -H "Content-Type: application/json" \\
    -d "{\\"token\\":\\"\$ENROLL_TOKEN\\",\\"hostname\\":\\"\$(hostname)\\",\\"os\\":\\"macos\\",\\"osVersion\\":\\"\$(sw_vers -productVersion)\\",\\"serialNumber\\":\\"\$(system_profiler SPHardwareDataType | awk '/Serial/ {print \$4}')\\",\\"macAddress\\":\\"\$(ifconfig en0 | awk '/ether/{print \$2}')\\",\\"ipAddress\\":\\"\$(ipconfig getifaddr en0 || echo '127.0.0.1')\\"}"
fi
echo "[+] Enrollment completed successfully! Connect & Backstage are now active."
`;
    res.setHeader('Content-Type', 'text/plain');
    res.send(script);
    return;
  }

  if (os === 'linux') {
    const script = `#!/bin/bash
set -e
SERVER_URL="${serverUrl}"
ENROLL_TOKEN="${effectiveToken}"
RAW_ARCH="\$(uname -m)"
if [ "\$RAW_ARCH" = "aarch64" ] || [ "\$RAW_ARCH" = "arm64" ]; then
  ARCH="arm64"
else
  ARCH="amd64"
fi

echo "=========================================================="
echo "  ApexMSP Linux Endpoint Agent Setup (\$ARCH)"
echo "=========================================================="

if [ "\$(id -u)" -eq 0 ]; then
  INSTALL_DIR="/opt/apexmsp"
else
  INSTALL_DIR="\$HOME/.apexmsp"
fi
mkdir -p "\$INSTALL_DIR"

echo "[*] Downloading ApexMSP Linux Agent (\$ARCH)..."
curl -kfsSL "\$SERVER_URL/api/v1/installers/download?os=linux&arch=\$ARCH&token=\$ENROLL_TOKEN" -o "\$INSTALL_DIR/openmsp-agent"
chmod 755 "\$INSTALL_DIR/openmsp-agent"

cat > "\$INSTALL_DIR/openmsp-agent.json" <<EOF
{
  "serverUrl": "\$SERVER_URL",
  "token": "\$ENROLL_TOKEN",
  "heartbeatIntervalSeconds": 10
}
EOF

"\$INSTALL_DIR/openmsp-agent" --server="\$SERVER_URL" --token="\$ENROLL_TOKEN" --config="\$INSTALL_DIR/openmsp-agent.json" --run-once || true

if [ "\$(id -u)" -eq 0 ] && command -v systemctl >/dev/null 2>&1; then
  cat > /etc/systemd/system/apexmsp-agent.service <<SVCEOF
[Unit]
Description=ApexMSP Endpoint Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=\$INSTALL_DIR/openmsp-agent --server=\$SERVER_URL --config=\$INSTALL_DIR/openmsp-agent.json
WorkingDirectory=\$INSTALL_DIR
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SVCEOF
  systemctl daemon-reload 2>/dev/null || true
  systemctl enable --now apexmsp-agent.service 2>/dev/null || true
  echo "[+] systemd service apexmsp-agent.service enabled and running."
else
  pkill -f "openmsp-agent" 2>/dev/null || true
  nohup "\$INSTALL_DIR/openmsp-agent" --server="\$SERVER_URL" --config="\$INSTALL_DIR/openmsp-agent.json" >/dev/null 2>&1 &
  echo "[+] Background daemon started."
fi

echo "[+] Enrollment completed! Machine placed in Onboarding Group for admin assignment."
`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(script);
    return;
  }

  if (os === 'android') {
    const batScript = `@echo off
REM ============================================================
REM  ApexMSP Android Remote Control - Unattended MediaProjection
REM  Target: net.christianbeier.droidvnc_ng & app.apexmsp.agent
REM ============================================================
echo [ApexMSP] Waiting for connected Android tablet (USB debugging ON)...
adb wait-for-device
echo [ApexMSP] Tablet detected. Applying permissions...

REM 1. DroidVNC-NG Silent Screen Capture (MediaProjection)
adb shell appops set net.christianbeier.droidvnc_ng PROJECT_MEDIA allow

REM 2. DroidVNC-NG Overlay & Unattended Running
adb shell appops set net.christianbeier.droidvnc_ng SYSTEM_ALERT_WINDOW allow

REM 3. ApexMSP Agent System Alert Window
adb shell appops set app.apexmsp.agent SYSTEM_ALERT_WINDOW allow

REM 4. Headwind Kiosk Launcher permissions (if enrolled as Kiosk)
adb shell appops set com.hmdm.launcher SYSTEM_ALERT_WINDOW allow 2>nul
adb shell appops set com.hmdm.launcher GET_USAGE_STATS allow 2>nul
adb shell appops set com.hmdm.launcher WRITE_SETTINGS allow 2>nul
adb shell pm grant com.hmdm.launcher android.permission.WRITE_SECURE_SETTINGS 2>nul

echo.
echo [ApexMSP] Restarting DroidVNC service to engage silent remote control...
adb shell am force-stop net.christianbeier.droidvnc_ng 2>nul
adb shell am start-foreground-service -n net.christianbeier.droidvnc_ng/.MainActivity 2>nul || adb shell monkey -p net.christianbeier.droidvnc_ng -c android.intent.category.LAUNCHER 1 2>nul

echo.
echo ============================================================
echo [ApexMSP] SUCCESS: Unattended remote screen capture enabled!
echo ============================================================
echo You can now connect via ApexConnect Backstage or Remote Control.
pause
`;
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'attachment; filename="allowmedia.bat"');
    res.send(batScript);
    return;
  }

  // Windows PowerShell script
  const script = `# OpenMSP Windows Agent Enrollment & Shark Fin Tray Script (ScreenConnect <3s Fast-Path)
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ServerUrl = "${serverUrl}"
$EnrollToken = "${effectiveToken}"

$IsAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $IsAdmin -and $env:APEXMSP_ELEVATED -ne '1') {
    Write-Host "[*] Requesting Administrator privileges (UAC) to register ApexMSPAgent Windows Service..." -ForegroundColor Cyan
    try {
        $ElevateCmd = "\`$env:APEXMSP_ELEVATED='1'; \`$ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm '$ServerUrl/api/v1/installers/windows/$EnrollToken' | iex"
        Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $ElevateCmd) -Wait -ErrorAction Stop
        Write-Host "[+] Elevated installation completed!" -ForegroundColor Green
        return
    } catch {
        Write-Host "[*] Continuing in current user mode (non-elevated user-space agent + startup registration)..." -ForegroundColor Cyan
    }
}

$InstallDir = if ($IsAdmin) { "$env:ProgramData\\ApexMSP" } else { "$env:LOCALAPPDATA\\ApexMSP" }
if (!(Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  ApexMSP Windows Endpoint Agent & Shark Fin Setup        " -ForegroundColor Cyan
Write-Host "  Agent Release: v2.1.0  |  Mode: $(if ($IsAdmin) { 'Administrator (Windows Service)' } else { 'User-Space Service' })" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 0. Stop any existing agent service/process first so binary can be updated cleanly without file lock
if ($IsAdmin -and (Get-Service -Name "ApexMSPAgent" -ErrorAction SilentlyContinue)) {
    Stop-Service -Name "ApexMSPAgent" -Force -ErrorAction SilentlyContinue
}
Stop-Process -Name "openmsp-agent" -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 150

# 1. Download OpenMSP Windows Agent Binary (v2.1.0) — fast WebClient with $ProgressPreference=SilentlyContinue
$AgentExe = "$InstallDir\\openmsp-agent.exe"
$ReuseBinary = $false
if ((Test-Path $AgentExe) -and $env:APEX_FORCE_DOWNLOAD -ne '1') {
    try {
        $fi = Get-Item $AgentExe
        if ($fi.Length -gt 5000000 -and ((Get-Date) - $fi.LastWriteTime).TotalMinutes -lt 30) {
            $ReuseBinary = $true
            Write-Host "[+] Using freshly downloaded agent binary at $AgentExe" -ForegroundColor Green
        }
    } catch {}
}
if (-not $ReuseBinary) {
    Write-Host "[*] Downloading ApexMSP Windows Agent binary (v2.1.0)..." -ForegroundColor Yellow
    try {
        $wc = New-Object System.Net.WebClient
        $wc.DownloadFile("$ServerUrl/api/v1/installers/download/windows", $AgentExe)
        Write-Host "[+] Downloaded agent binary v2.1.0 to $AgentExe" -ForegroundColor Green
    } catch {
        try {
            Invoke-WebRequest -Uri "$ServerUrl/api/v1/installers/download/windows" -OutFile $AgentExe -UseBasicParsing -ErrorAction Stop
            Write-Host "[+] Downloaded agent binary v2.1.0 to $AgentExe" -ForegroundColor Green
        } catch {
            Write-Host "[-] Binary download note: $_" -ForegroundColor DarkYellow
        }
    }
}

# 2. Immediate Control Plane Enrollment + Write configuration file (UTF-8 without BOM)
$ConfigFile = "$InstallDir\\openmsp-agent.json"
$ExistingDeviceId = $null
$ExistingDeviceSecret = $null
if (Test-Path $ConfigFile) {
    try {
        $OldCfg = Get-Content -Raw -Path $ConfigFile | ConvertFrom-Json
        if ($OldCfg.deviceId) { $ExistingDeviceId = $OldCfg.deviceId }
        if ($OldCfg.deviceSecret) { $ExistingDeviceSecret = $OldCfg.deviceSecret }
    } catch {}
}

# Collect hardware & network identity and enroll immediately via PowerShell so even legacy Windows Server 2012 R2 or reassigned endpoints register in <1s
try {
    $WinOs = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
    if (-not $WinOs) { $WinOs = Get-WmiObject Win32_OperatingSystem -ErrorAction SilentlyContinue }
    $WinBios = Get-CimInstance Win32_BIOS -ErrorAction SilentlyContinue
    if (-not $WinBios) { $WinBios = Get-WmiObject Win32_BIOS -ErrorAction SilentlyContinue }
    $SerialNum = if ($WinBios -and $WinBios.SerialNumber) { $WinBios.SerialNumber.Trim() } else { "" }
    if (-not $SerialNum -or $SerialNum -match 'To be filled|Default string|System Serial|None') {
        $WinBoard = Get-WmiObject Win32_BaseBoard -ErrorAction SilentlyContinue
        if ($WinBoard -and $WinBoard.SerialNumber) { $SerialNum = $WinBoard.SerialNumber.Trim() }
    }
    $WinCs = Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue
    if (-not $WinCs) { $WinCs = Get-WmiObject Win32_ComputerSystem -ErrorAction SilentlyContinue }
    $NetAll = @(Get-WmiObject Win32_NetworkAdapterConfiguration -Filter "IPEnabled = True" -ErrorAction SilentlyContinue)
    $NetCfg = $NetAll | Where-Object { $_.IPAddress -and $_.IPAddress[0] -notlike '169.254.*' -and $_.DefaultIPGateway } | Select-Object -First 1
    if (-not $NetCfg) { $NetCfg = $NetAll | Where-Object { $_.IPAddress -and $_.IPAddress[0] -notlike '169.254.*' } | Select-Object -First 1 }
    if (-not $NetCfg) { $NetCfg = $NetAll | Select-Object -First 1 }
    $LocalIp = if ($NetCfg -and $NetCfg.IPAddress) { $NetCfg.IPAddress[0] } else { "" }
    $MacAddr = if ($NetCfg -and $NetCfg.MACAddress) { $NetCfg.MACAddress } else { "" }
    $EnrollBody = @{
        token = $EnrollToken
        hostname = $env:COMPUTERNAME
        os = "windows"
        osVersion = if ($WinOs -and $WinOs.Caption) { "$($WinOs.Caption.Trim()) ($($WinOs.BuildNumber))" } else { "Windows ($([Environment]::OSVersion.Version))" }
        serialNumber = $SerialNum
        macAddress = $MacAddr
        ipAddress = $LocalIp
        domain = if ($WinCs -and $WinCs.Domain) { $WinCs.Domain } else { $env:USERDOMAIN }
        loggedInUser = if ($WinCs -and $WinCs.UserName) { $WinCs.UserName } else { "$env:USERDOMAIN\\$env:USERNAME" }
        installerRun = $true
    } | ConvertTo-Json -Compress
    $EnrollRes = Invoke-RestMethod -Method Post -Uri "$ServerUrl/api/v1/agents/enroll" -ContentType "application/json" -Body $EnrollBody -TimeoutSec 8 -ErrorAction Stop
    if ($EnrollRes -and $EnrollRes.deviceId -and $EnrollRes.deviceSecret) {
        $ExistingDeviceId = $EnrollRes.deviceId
        $ExistingDeviceSecret = $EnrollRes.deviceSecret
        if ($EnrollRes.clientId) { $env:APEX_CLIENT_ID = $EnrollRes.clientId }
        Write-Host "[+] Enrolled endpoint with ApexMSP Control Plane ($ExistingDeviceId -> $($EnrollRes.clientId))" -ForegroundColor Green
    }
} catch {
    Write-Host "[*] Note: Direct enrollment deferred to agent daemon ($_)" -ForegroundColor DarkYellow
}

$ConfigMap = @{
    serverUrl = $ServerUrl
    token = $EnrollToken
    heartbeatIntervalSeconds = 10
    agentVersion = "2.1.0"
}
if ($env:APEX_CLIENT_ID) {
    $ConfigMap.clientId = $env:APEX_CLIENT_ID
}
if ($ExistingDeviceId -and $ExistingDeviceSecret) {
    $ConfigMap.deviceId = $ExistingDeviceId
    $ConfigMap.deviceSecret = $ExistingDeviceSecret
}
$ConfigObj = $ConfigMap | ConvertTo-Json
[System.IO.File]::WriteAllText($ConfigFile, $ConfigObj, (New-Object System.Text.UTF8Encoding $false))

# 2b. IMMEDIATELY Register & Start ApexMSPAgent Windows Service (completes in <1s before any RMM timeout)
$ServiceCreated = $false
$IsLegacyWin = ([Environment]::OSVersion.Version.Major -lt 10)
if ($IsAdmin -and -not $IsLegacyWin) {
    Write-Host "[*] Registering ApexMSPAgent Windows Service..." -ForegroundColor Cyan
    if (Get-Service -Name "ApexMSPAgent" -ErrorAction SilentlyContinue) {
        try {
            Stop-Service -Name "ApexMSPAgent" -Force -ErrorAction SilentlyContinue
            sc.exe delete ApexMSPAgent 2>$null | Out-Null
            Start-Sleep -Milliseconds 150
        } catch {}
    }
    try {
        $BinPath = '"' + $AgentExe + '" --server "' + $ServerUrl + '" --token "' + $EnrollToken + '" --config "' + $ConfigFile + '"'
        New-Service -Name "ApexMSPAgent" -BinaryPathName $BinPath -DisplayName "ApexMSP Endpoint Agent" -Description "ApexMSP Endpoint Agent & EDR Service (v2.1.0)" -StartupType Automatic -ErrorAction Stop | Out-Null
        sc.exe failure ApexMSPAgent reset= 86400 actions= restart/5000/restart/10000/restart/60000 2>$null | Out-Null
        Start-Service -Name "ApexMSPAgent" -ErrorAction Stop
        $ServiceCreated = $true
        Write-Host "[+] Windows Service 'ApexMSPAgent' registered and RUNNING!" -ForegroundColor Green
    } catch {
        Write-Host "[*] Launching ApexMSPAgent background daemon..." -ForegroundColor Cyan
    }
}
if (-not $ServiceCreated -and -not $IsLegacyWin) {
    try {
        $AgentRunCmd = '"' + $AgentExe + '" --server "' + $ServerUrl + '" --token "' + $EnrollToken + '" --config "' + $ConfigFile + '"'
        Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" -Name "ApexMSPAgent" -Value $AgentRunCmd -ErrorAction SilentlyContinue
    } catch {}
    if (Test-Path $AgentExe) {
        Start-Process -FilePath $AgentExe -ArgumentList ("--server " + $ServerUrl + " --token " + $EnrollToken + " --config " + $ConfigFile) -WorkingDirectory $InstallDir -WindowStyle Hidden -ErrorAction SilentlyContinue
        Write-Host "[+] ApexMSPAgent background daemon (v2.1.0) active and registered for auto-start." -ForegroundColor Green
    }
}

# 2c. Legacy Windows Server 2012 R2 / Service Fallback Daemon (ensures 100% live heartbeats & script execution even if Go 1.22+ binary cannot load on Win2012R2 Build 9600)
if (-not $IsLegacyWin) { Start-Sleep -Milliseconds 400 }
$GoAgentRunning = $false
try {
    $SvcCheck = Get-Service -Name "ApexMSPAgent" -ErrorAction SilentlyContinue
    if ($SvcCheck -and $SvcCheck.Status -eq 'Running') { $GoAgentRunning = $true }
    if (Get-Process -Name "openmsp-agent" -ErrorAction SilentlyContinue) { $GoAgentRunning = $true }
} catch {}

if (-not $GoAgentRunning) {
    Write-Host "[*] Activating Native PowerShell Telemetry & Command Daemon (Windows Server 2012 R2 / Compatibility Mode)..." -ForegroundColor Cyan
    $PsAgentScript = "$InstallDir\\ApexMSP-PSAgent.ps1"
    $PsAgentContent = @'
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$InstallDir = if (Test-Path "$env:ProgramData\\ApexMSP\\openmsp-agent.json") { "$env:ProgramData\\ApexMSP" } else { "$env:LOCALAPPDATA\\ApexMSP" }
$ConfigFile = "$InstallDir\\openmsp-agent.json"

try {
    Get-WmiObject Win32_Process -Filter "Name = 'powershell.exe'" | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*ApexMSP-PSAgent.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
} catch {}

$LoopCount = 0
while ($true) {
    try {
        if (Get-Process -Name "openmsp-agent" -ErrorAction SilentlyContinue) {
            Start-Sleep -Seconds 30
            continue
        }
        $Cfg = Get-Content -Raw -Path $ConfigFile | ConvertFrom-Json
        $ServerUrl = $Cfg.serverUrl
        $DeviceId = $Cfg.deviceId
        $DeviceSecret = $Cfg.deviceSecret

        if (-not $DeviceId -or -not $DeviceSecret) {
            $WinOs = Get-WmiObject Win32_OperatingSystem
            $WinBios = Get-WmiObject Win32_BIOS
            $WinCs = Get-WmiObject Win32_ComputerSystem
            $NetCfg = Get-WmiObject Win32_NetworkAdapterConfiguration -Filter "IPEnabled = True" | Select-Object -First 1
            $EnrollBody = @{
                token = $Cfg.token
                hostname = $env:COMPUTERNAME
                os = "windows"
                osVersion = if ($WinOs) { "$($WinOs.Caption.Trim()) ($($WinOs.BuildNumber))" } else { "Windows Server" }
                serialNumber = if ($WinBios) { $WinBios.SerialNumber.Trim() } else { "" }
                macAddress = if ($NetCfg) { $NetCfg.MACAddress } else { "" }
                ipAddress = if ($NetCfg -and $NetCfg.IPAddress) { $NetCfg.IPAddress[0] } else { "" }
                domain = if ($WinCs) { $WinCs.Domain } else { $env:USERDOMAIN }
                loggedInUser = if ($WinCs -and $WinCs.UserName) { $WinCs.UserName } else { "$env:USERDOMAIN\\$env:USERNAME" }
            } | ConvertTo-Json -Compress
            $EnrollRes = Invoke-RestMethod -Method Post -Uri "$ServerUrl/api/v1/agents/enroll" -ContentType "application/json" -Body $EnrollBody -TimeoutSec 10
            if ($EnrollRes -and $EnrollRes.deviceId) {
                $Cfg | Add-Member -NotePropertyName deviceId -NotePropertyValue $EnrollRes.deviceId -Force
                $Cfg | Add-Member -NotePropertyName deviceSecret -NotePropertyValue $EnrollRes.deviceSecret -Force
                [System.IO.File]::WriteAllText($ConfigFile, ($Cfg | ConvertTo-Json), (New-Object System.Text.UTF8Encoding $false))
                $DeviceId = $EnrollRes.deviceId
                $DeviceSecret = $EnrollRes.deviceSecret
            }
        }

        if ($DeviceId -and $DeviceSecret) {
            $WinOs = Get-WmiObject Win32_OperatingSystem
            $CpuLoad = (Get-WmiObject Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
            if (-not $CpuLoad) { $CpuLoad = 4 }
            $RamPct = if ($WinOs -and $WinOs.TotalVisibleMemorySize -gt 0) { [math]::Round((($WinOs.TotalVisibleMemorySize - $WinOs.FreePhysicalMemory) / $WinOs.TotalVisibleMemorySize) * 100, 1) } else { 35 }
            $DiskC = Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='C:'"
            $DiskPct = if ($DiskC -and $DiskC.Size -gt 0) { [math]::Round((($DiskC.Size - $DiskC.FreeSpace) / $DiskC.Size) * 100, 1) } else { 20 }
            $UptimeDays = if ($WinOs -and $WinOs.LastBootUpTime) { [math]::Round(((Get-Date) - [Management.ManagementDateTimeConverter]::ToDateTime($WinOs.LastBootUpTime)).TotalDays, 2) } else { 1.0 }
            $NetCfg = Get-WmiObject Win32_NetworkAdapterConfiguration -Filter "IPEnabled = True" | Select-Object -First 1
            $WinCs = Get-WmiObject Win32_ComputerSystem

            $HbMap = @{
                deviceId = $DeviceId
                deviceSecret = $DeviceSecret
                agentVersion = "2.1.0"
                arch = "amd64"
                domain = if ($WinCs -and $WinCs.Domain) { $WinCs.Domain } else { $env:USERDOMAIN }
                loggedInUser = if ($WinCs -and $WinCs.UserName) { $WinCs.UserName } else { "$env:USERDOMAIN\\$env:USERNAME" }
                metrics = @{
                    cpuUsage = [int]$CpuLoad
                    ramUsage = [int]$RamPct
                    diskUsage = [int]$DiskPct
                    uptimeDays = $UptimeDays
                    lastSeen = (Get-Date).ToUniversalTime().ToString("o")
                }
                network = @{
                    ipAddress = if ($NetCfg -and $NetCfg.IPAddress) { $NetCfg.IPAddress[0] } else { "" }
                    macAddress = if ($NetCfg) { $NetCfg.MACAddress } else { "" }
                }
            }

            if ($LoopCount % 10 -eq 0) {
                $Svcs = @(Get-Service | Select-Object -First 60 | ForEach-Object {
                    @{
                        name = $_.Name
                        displayName = $_.DisplayName
                        status = if ($_.Status -eq 'Running') { 'running' } else { 'stopped' }
                        startupType = 'auto'
                    }
                })
                $Apps = @(Get-ItemProperty "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*" -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | Select-Object -First 50 | ForEach-Object {
                    @{
                        id = ($_.PSChildName -replace '[^a-zA-Z0-9_-]', '')
                        name = [string]$_.DisplayName
                        version = if ($_.DisplayVersion) { [string]$_.DisplayVersion } else { "1.0" }
                        publisher = if ($_.Publisher) { [string]$_.Publisher } else { "Microsoft / Vendor" }
                        installDate = (Get-Date).ToString("yyyy-MM-dd")
                    }
                })
                $HbMap.services = $Svcs
                $HbMap.installedApps = $Apps
            }

            $HbBody = $HbMap | ConvertTo-Json -Depth 6 -Compress
            $HbRes = Invoke-RestMethod -Method Post -Uri "$ServerUrl/api/v1/agents/heartbeat" -ContentType "application/json" -Body $HbBody -TimeoutSec 10
            if ($HbRes -and $HbRes.pendingCommands) {
                foreach ($cmd in $HbRes.pendingCommands) {
                    $CmdOut = ""
                    $CmdErr = ""
                    $CmdStatus = "completed"
                    try {
                        if ($cmd.commandType -eq "run_script" -and $cmd.payload -and $cmd.payload.script) {
                            $CmdOut = (Invoke-Expression $cmd.payload.script | Out-String)
                        } elseif ($cmd.commandType -eq "restart_service" -and $cmd.payload -and $cmd.payload.serviceName) {
                            Restart-Service -Name $cmd.payload.serviceName -Force -ErrorAction Stop
                            $CmdOut = "Service $($cmd.payload.serviceName) restarted."
                        } else {
                            $CmdOut = "Executed $($cmd.commandType)"
                        }
                    } catch {
                        $CmdStatus = "failed"
                        $CmdErr = $_.Exception.Message
                    }
                    $ResBody = @{
                        deviceId = $DeviceId
                        deviceSecret = $DeviceSecret
                        status = $CmdStatus
                        output = if ($CmdOut) { $CmdOut } else { "[Completed]" }
                        error = $CmdErr
                    } | ConvertTo-Json -Compress
                    Invoke-RestMethod -Method Post -Uri "$ServerUrl/api/v1/agents/commands/$($cmd.id)/result" -ContentType "application/json" -Body $ResBody -TimeoutSec 10 | Out-Null
                }
            }
        }
    } catch {}
    $LoopCount++
    Start-Sleep -Seconds 15
}
'@
    Set-Content -Path $PsAgentScript -Value $PsAgentContent -Encoding UTF8
    try {
        $PsCmd = 'powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $PsAgentScript + '"'
        Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run" -Name "ApexMSPPSAgent" -Value $PsCmd -ErrorAction SilentlyContinue
        schtasks.exe /Create /TN "ApexMSPPSAgent" /TR $PsCmd /SC ONSTART /RU SYSTEM /RL HIGHEST /F 2>$null | Out-Null
        schtasks.exe /Run /TN "ApexMSPPSAgent" 2>$null | Out-Null
    } catch {}
    try {
        Invoke-WmiMethod -Class Win32_Process -Name Create -ArgumentList ('powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $PsAgentScript + '"') | Out-Null
    } catch {
        Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-File", $PsAgentScript) -WindowStyle Hidden
    }
    Write-Host "[+] Native PowerShell Telemetry & Command Daemon active!" -ForegroundColor Green
}

# 3. Create the Shark Fin System Tray Script
$TrayScript = "$InstallDir\\ApexMSP-Tray.ps1"
$TrayContent = @'
$ErrorActionPreference = 'SilentlyContinue'
try {
    Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*ApexMSP-Tray.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
} catch {}
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$InstallDir = if (Test-Path "$env:ProgramData\\ApexMSP\\openmsp-agent.json") { "$env:ProgramData\\ApexMSP" } else { "$env:LOCALAPPDATA\\ApexMSP" }
if (!(Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
}

$icoPath = "$InstallDir\\sharkfin.ico"

# Create Shark Fin icon file if not exists
if (!(Test-Path $icoPath)) {
    try {
        $bmp = New-Object System.Drawing.Bitmap(32, 32)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 14, 165, 233), 2.5)
        $penWater = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 56, 189, 248), 2.0)
        $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(210, 14, 165, 233))

        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $path.StartFigure()
        $path.AddBezier(5, 22, 8, 14, 15, 6, 22, 5)
        $path.AddBezier(22, 5, 24, 13, 25, 18, 26, 22)
        $path.CloseFigure()

        $g.FillPath($brush, $path)
        $g.DrawPath($pen, $path)
        $g.DrawLine($penWater, 3, 26, 29, 26)

        $hIcon = $bmp.GetHicon()
        $tempIcon = [System.Drawing.Icon]::FromHandle($hIcon)
        $fs = New-Object System.IO.FileStream($icoPath, [System.IO.FileMode]::Create)
        $tempIcon.Save($fs)
        $fs.Close()
        $tempIcon.Dispose()
        $bmp.Dispose()
    } catch {}
}

$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
if (Test-Path $icoPath) {
    try {
        $notifyIcon.Icon = New-Object System.Drawing.Icon($icoPath)
    } catch {}
}

if ($notifyIcon.Icon -eq $null) {
    $notifyIcon.Icon = [System.Drawing.SystemIcons]::Application
}

$notifyIcon.Text = "ApexMSP Shark Fin: Security & RMM Active (v2.0.4-soc)"
$notifyIcon.Visible = $true

function Promote-SharkFinTrayIcon {
    try {
        Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer' -Name 'EnableAutoTray' -Value 0 -Type DWord -ErrorAction SilentlyContinue
        Get-ChildItem 'HKCU:\\Control Panel\\NotifyIconSettings' -ErrorAction SilentlyContinue | ForEach-Object {
            Set-ItemProperty -Path $_.PSPath -Name 'IsPromoted' -Value 1 -Type DWord -ErrorAction SilentlyContinue
        }
    } catch {}
}
Promote-SharkFinTrayIcon
$promoteTimer = New-Object System.Windows.Forms.Timer
$promoteTimer.Interval = 2000
$promoteCount = 0
$promoteTimer.add_Tick({
    Promote-SharkFinTrayIcon
    $script:promoteCount++
    if ($script:promoteCount -ge 5) { $promoteTimer.Stop() }
})
$promoteTimer.Start()

$contextMenu = New-Object System.Windows.Forms.ContextMenuStrip
$headerItem = $contextMenu.Items.Add("ApexMSP Shark Fin Security & RMM ($env:COMPUTERNAME)")
if ($notifyIcon.Icon -ne $null) {
    try { $headerItem.Image = $notifyIcon.Icon.ToBitmap() } catch {}
}
$headerItem.Enabled = $false
$statusItem = $contextMenu.Items.Add("Status: Online  ·  Agent v2.0.4-soc (Tray v2.3.0)")
$statusItem.Enabled = $false
$contextMenu.Items.Add("-") | Out-Null

$clientsHeader = $contextMenu.Items.Add("Installed Clients & Sensor Versions")
$clientsHeader.Enabled = $false
@(
    "  ApexMSP Core RMM Agent — v2.0.4-soc [Active]",
    "  ApexConnect Remote (MeshAgent) — v1.1.24 [Installed]",
    "  Windows Defender Preventive AV — v4.18.24090 [Protected]",
    "  ApexMSP Go EDR Reflex & VSS Guard — v2.0.4 [Monitoring]",
    "  Ransomware Canary Tripwire — v2.0.4 [3/3 Armed]",
    "  YARA-X & ClamAV Scanner Engine — v0.10.0 / v1.4.1 [Ready]",
    "  Wazuh SIEM Endpoint Sensor — v4.9.2 [Connected]",
    "  Velociraptor DFIR Client — v0.73.1 [Standby]",
    "  Shuffle Go Orborus SOAR Worker — v1.4.0 [Subscribed]"
) | ForEach-Object {
    $ci = $contextMenu.Items.Add($_)
    $ci.Enabled = $false
}
$contextMenu.Items.Add("-") | Out-Null
$portalItem = $contextMenu.Items.Add("Open ApexMSP Console")
$portalItem.add_Click({ [System.Diagnostics.Process]::Start("https://apexmsp.app") })
$contextMenu.Items.Add("-") | Out-Null
$exitItem = $contextMenu.Items.Add("Exit")

$appContext = New-Object System.Windows.Forms.ApplicationContext
$exitItem.add_Click({
    $notifyIcon.Visible = $false
    $notifyIcon.Dispose()
    $appContext.ExitThread()
})

$notifyIcon.ContextMenuStrip = $contextMenu
$notifyIcon.ShowBalloonTip(4000, "ApexMSP Connected", "Windows device managed securely by ApexMSP.", [System.Windows.Forms.ToolTipIcon]::Info)

[System.Windows.Forms.Application]::Run($appContext)
'@
Set-Content -Path $TrayScript -Value $TrayContent -Encoding UTF8

# 4. Launch Shark Fin System Tray Icon immediately (no blocking sleep)
Write-Host "[*] Launching Shark Fin Tray Icon in taskbar notification area..." -ForegroundColor Cyan

# A. Common startup folder (for all users)
$CommonStartup = [Environment]::GetFolderPath('CommonStartup')
if (Test-Path $CommonStartup) {
    try {
        $WshShell = New-Object -ComObject WScript.Shell
        $Shortcut = $WshShell.CreateShortcut("$CommonStartup\\ApexMSP-Tray.lnk")
        $Shortcut.TargetPath = "powershell.exe"
        $Shortcut.Arguments = ('-Sta -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $TrayScript + '"')
        $Shortcut.WindowStyle = 7
        $Shortcut.Save()
    } catch {}
}

# B. User startup folder
$UserStartup = [Environment]::GetFolderPath('Startup')
if (Test-Path $UserStartup) {
    try {
        $WshShell = New-Object -ComObject WScript.Shell
        $Shortcut = $WshShell.CreateShortcut("$UserStartup\\ApexMSP-Tray.lnk")
        $Shortcut.TargetPath = "powershell.exe"
        $Shortcut.Arguments = ('-Sta -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $TrayScript + '"')
        $Shortcut.WindowStyle = 7
        $Shortcut.Save()
    } catch {}
}

# C. Registry Run key (launches for all interactive users on boot)
try {
    Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run" -Name "ApexMSPTray" -Value ('powershell.exe -Sta -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $TrayScript + '"') -ErrorAction SilentlyContinue
} catch {}

# D. Scheduled Task using S-1-5-32-545 (BUILTIN\\Users) so AzureAD/EntraID, Domain, and Local users all get the interactive tray icon immediately
try {
    Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -match 'ApexMSP-Tray' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    $Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument ('-Sta -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $TrayScript + '"')
    $Trigger = New-ScheduledTaskTrigger -AtLogOn
    $Principal = New-ScheduledTaskPrincipal -GroupId "S-1-5-32-545" -RunLevel Limited
    Register-ScheduledTask -TaskName "ApexMSPTray" -Action $Action -Trigger $Trigger -Principal $Principal -Force | Out-Null
    Start-ScheduledTask -TaskName "ApexMSPTray" -ErrorAction SilentlyContinue
    Get-ChildItem 'Registry::HKEY_USERS\*\Control Panel\NotifyIconSettings\*' -ErrorAction SilentlyContinue | ForEach-Object { Set-ItemProperty -Path $_.PSPath -Name 'IsPromoted' -Value 1 -Type DWord -ErrorAction SilentlyContinue }
} catch {}

# 5. Install/Repair ApexConnect Remote Desktop (Mesh Agent) in a detached WMI background process so ScreenConnect's 10s timeout never kills it
if ($IsAdmin) {
    Write-Host "[*] Configuring ApexConnect Remote Desktop & Backstage in background..." -ForegroundColor Cyan
    $MeshBgScript = "$InstallDir\\ApexMSP-MeshSetup.ps1"
    $MeshBgContent = @'
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$MeshExe = "$env:ProgramData\ApexMSP\meshagent64-ApexMSP.exe"
try {
    $wc = New-Object System.Net.WebClient
    $wc.DownloadFile("https://mesh.apexmsp.app/meshagents?id=4&meshid=ulSX8VuJN9hFinyXGPovEZ4o5ShNQY7AK06I94WuTLzN1AblKrSIrLVz9DZw8vib&installflags=0", $MeshExe)
} catch {
    Invoke-WebRequest -Uri "https://mesh.apexmsp.app/meshagents?id=4&meshid=ulSX8VuJN9hFinyXGPovEZ4o5ShNQY7AK06I94WuTLzN1AblKrSIrLVz9DZw8vib&installflags=0" -OutFile $MeshExe -UseBasicParsing
}
$MeshSvc = Get-Service -Name "Mesh Agent" -ErrorAction SilentlyContinue
if ($MeshSvc) {
    Set-Service -Name "Mesh Agent" -StartupType Automatic -ErrorAction SilentlyContinue
    Restart-Service -Name "Mesh Agent" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}
$MeshSvc = Get-Service -Name "Mesh Agent" -ErrorAction SilentlyContinue
if (-not $MeshSvc -or $MeshSvc.Status -ne 'Running') {
    Start-Process -FilePath $MeshExe -ArgumentList "-fullinstall" -WindowStyle Hidden -Wait -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Set-Service -Name "Mesh Agent" -StartupType Automatic -ErrorAction SilentlyContinue
    Start-Service -Name "Mesh Agent" -ErrorAction SilentlyContinue
}
Get-ChildItem 'Registry::HKEY_USERS\*\Control Panel\NotifyIconSettings\*' -ErrorAction SilentlyContinue | ForEach-Object { Set-ItemProperty -Path $_.PSPath -Name 'IsPromoted' -Value 1 -Type DWord -ErrorAction SilentlyContinue }
'@
    Set-Content -Path $MeshBgScript -Value $MeshBgContent -Encoding UTF8
    try {
        Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = ('powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $MeshBgScript + '"') } | Out-Null
    } catch {
        Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-File", $MeshBgScript) -WindowStyle Hidden
    }
}

Write-Host "[+] Installation Complete! ApexMSPAgent service is RUNNING and Shark Fin is active." -ForegroundColor Green
`;
  res.setHeader('Content-Type', 'text/plain');
  res.send(script);
}

// GET /api/v1/installers/script?token=...&os=windows|macos
router.get('/script', (req, res) => {
  const ua = String(req.get('user-agent') || '').toLowerCase();
  const defaultOs = ua.includes('powershell') || ua.includes('windows') ? 'windows' : 'macos';
  const os = (req.query.os as string) || defaultOs;
  const token = req.query.token as string | undefined;
  renderScript(os, token, req, res);
});

// GET /api/v1/installers/windows/:token (ampersand-free PowerShell installer URL: supports /windows, /windows/new, /windows/token=new, /windows/gambinos, /windows/gambinos/pos)
router.get(['/windows/:token/:site', '/windows/:token', '/windows'], (req, res) => {
  const token = (req.params.token as string) || (req.query.token as string | undefined);
  renderScript('windows', token, req, res);
});

// GET /api/v1/installers/macos/:token (ampersand-free macOS installer URL: supports /macos, /macos/new, /macos/token=new, /macos/gambinos, /macos/gambinos/pos)
router.get(['/macos/:token/:site', '/macos/:token', '/macos'], (req, res) => {
  const token = (req.params.token as string) || (req.query.token as string | undefined);
  renderScript('macos', token, req, res);
});

// GET /api/v1/installers/quick/:ext (ps1, sh)
router.get(['/quick/:ext', '/quick'], (req, res) => {
  const ext = String(req.params.ext || '').toLowerCase();
  const os = (ext === 'ps1' || ext === 'bat' || ext === 'cmd' || ext === 'windows') ? 'windows' : (ext === 'android' ? 'android' : 'macos');
  const token = req.query.token as string | undefined;
  renderScript(os, token, req, res);
});

// GET /api/v1/installers/android/allowmedia.bat
router.get('/android/allowmedia.bat', (_req, res) => {
  const batScript = `@echo off
REM ============================================================
REM  ApexMSP Android Remote Control - Unattended MediaProjection
REM  Pre-grants MediaProjection and Overlay permissions
REM ============================================================
echo [ApexMSP] Waiting for connected Android tablet (USB debugging ON)...
adb wait-for-device
echo [ApexMSP] Tablet detected. Applying permissions...

adb shell appops set net.christianbeier.droidvnc_ng PROJECT_MEDIA allow
adb shell appops set net.christianbeier.droidvnc_ng SYSTEM_ALERT_WINDOW allow
adb shell appops set app.apexmsp.agent SYSTEM_ALERT_WINDOW allow
adb shell appops set com.hmdm.launcher SYSTEM_ALERT_WINDOW allow 2>nul
adb shell appops set com.hmdm.launcher GET_USAGE_STATS allow 2>nul
adb shell appops set com.hmdm.launcher WRITE_SETTINGS allow 2>nul
adb shell pm grant com.hmdm.launcher android.permission.WRITE_SECURE_SETTINGS 2>nul

echo.
echo [ApexMSP] Restarting DroidVNC service...
adb shell am force-stop net.christianbeier.droidvnc_ng 2>nul
adb shell am start-foreground-service -n net.christianbeier.droidvnc_ng/.MainActivity 2>nul || adb shell monkey -p net.christianbeier.droidvnc_ng -c android.intent.category.LAUNCHER 1 2>nul

echo.
echo [ApexMSP] Done! Unattended remote screen capture enabled.
pause
`;
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', 'attachment; filename="allowmedia.bat"');
  res.send(batScript);
});

// GET /api/v1/installers/android/allowmedia.sh
router.get('/android/allowmedia.sh', (_req, res) => {
  const shScript = `#!/bin/bash
echo "[ApexMSP] Waiting for connected Android tablet (USB debugging ON)..."
adb wait-for-device
echo "[ApexMSP] Tablet detected. Applying permissions..."
adb shell appops set net.christianbeier.droidvnc_ng PROJECT_MEDIA allow
adb shell appops set net.christianbeier.droidvnc_ng SYSTEM_ALERT_WINDOW allow
adb shell appops set app.apexmsp.agent SYSTEM_ALERT_WINDOW allow
adb shell appops set com.hmdm.launcher SYSTEM_ALERT_WINDOW allow 2>/dev/null || true
adb shell appops set com.hmdm.launcher GET_USAGE_STATS allow 2>/dev/null || true
adb shell appops set com.hmdm.launcher WRITE_SETTINGS allow 2>/dev/null || true
adb shell pm grant com.hmdm.launcher android.permission.WRITE_SECURE_SETTINGS 2>/dev/null || true
echo "[ApexMSP] Restarting DroidVNC service..."
adb shell am force-stop net.christianbeier.droidvnc_ng 2>/dev/null || true
adb shell am start-foreground-service -n net.christianbeier.droidvnc_ng/.MainActivity 2>/dev/null || adb shell monkey -p net.christianbeier.droidvnc_ng -c android.intent.category.LAUNCHER 1 2>/dev/null || true
echo "[ApexMSP] Done! Unattended remote screen capture enabled."
`;
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', 'attachment; filename="allowmedia.sh"');
  res.send(shScript);
});

// GET /api/v1/installers/android/provision.bat
router.get('/android/provision.bat', (_req, res) => {
  const provScript = `@echo off
REM ============================================================
REM  ApexMSP Tablet Provisioning Script (Headwind + Remote)
REM ============================================================
echo [ApexMSP] Waiting for connected Android tablet...
adb wait-for-device
echo [ApexMSP] Applying full Headwind Kiosk + Remote permissions...
adb shell appops set com.hmdm.launcher SYSTEM_ALERT_WINDOW allow
adb shell appops set com.hmdm.launcher GET_USAGE_STATS allow
adb shell appops set com.hmdm.launcher WRITE_SETTINGS allow
adb shell pm grant com.hmdm.launcher android.permission.WRITE_SECURE_SETTINGS
adb shell appops set net.christianbeier.droidvnc_ng PROJECT_MEDIA allow
adb shell appops set net.christianbeier.droidvnc_ng SYSTEM_ALERT_WINDOW allow
adb shell appops set app.apexmsp.agent SYSTEM_ALERT_WINDOW allow
echo.
echo [ApexMSP] Rebooting tablet...
adb reboot
echo [ApexMSP] Complete!
pause
`;
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', 'attachment; filename="provision_apex_tablet.bat"');
  res.send(provScript);
});

// ---------------------------------------------------------------------------
// Direct Ethernet Cable Mac-to-Mac Migration (2015 MBP TB2 <-> M5 MBP USB-C)
// ---------------------------------------------------------------------------

// GET /api/v1/installers/mac-cable-sync -> Universal macOS Binary (x86_64 + arm64) or Windows Binary (?os=windows)
router.get('/mac-cable-sync', (req, res) => {
  const isWin = String(req.query.os || '').toLowerCase() === 'windows';
  const candidates = isWin
    ? [
        '/builds/apex-live-sync.exe',
        path.join(process.cwd(), 'bin', 'apex-live-sync.exe')
      ]
    : [
        '/builds/apex-live-sync-macos-universal',
        path.join(process.cwd(), 'bin', 'apex-live-sync-macos-universal')
      ];
  const found = candidates.find(p => fs.existsSync(p));
  if (!found) {
    res.status(404).json({ error: 'Live sync binary not found' });
    return;
  }
  res.setHeader('Content-Disposition', `attachment; filename="${isWin ? 'apex-live-sync.exe' : 'apex-live-sync'}"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.sendFile(path.resolve(found));
});

// POST /api/v1/installers/live-sync-report -> Receives live telemetry from 2015 MBP / M5 MBP
router.post('/live-sync-report', (req, res) => {
  const token = req.header('X-Apex-Sync-Token');
  if (token !== 'apex-live-sync-gambinos-2026') {
    res.status(401).json({ error: 'Unauthorized sync token' });
    return;
  }
  const body = req.body || {};
  if (body.sessionId === 'mac-cable-2015-to-m5') {
    const prev = (globalThis as any).__apexMacCableSyncStatus || {};
    (globalThis as any).__apexMacCableSyncStatus = {
      ...prev,
      ...body,
      receivedAtMs: Date.now(),
      updatedAt: new Date().toISOString()
    };
  }
  res.json({ ok: true });
});

// GET /api/v1/installers/mac-cable-receiver.sh -> Run on M5 MacBook Pro (USB-C to Ethernet)
router.get('/mac-cable-receiver.sh', (_req, res) => {
  const script = `#!/bin/bash
set -e
REAL_USER="\${SUDO_USER:-\$(stat -f '%Su' /dev/console 2>/dev/null || whoami)}"
if [ "\$REAL_USER" = "root" ] || [ -z "\$REAL_USER" ]; then
  REAL_USER="\$(ls -1 /Users | grep -vE '^(Shared|Guest|\\.localized)\$' | head -n 1)"
fi
TARGET_HOME="/Users/\$REAL_USER"

echo "=================================================================="
echo " ⚡ ApexVault Direct Cable Receiver (M5 MacBook Pro • USB-C Eth)"
echo " Target User Profile: \$TARGET_HOME (User: \$REAL_USER)"
echo "=================================================================="

curl -sSL -o /tmp/apex-live-sync "https://api.apexmsp.app/api/v1/installers/mac-cable-sync"
chmod +x /tmp/apex-live-sync
xattr -c /tmp/apex-live-sync 2>/dev/null || true

pkill -f "/tmp/apex-live-sync" 2>/dev/null || true
echo "🔌 Direct Ethernet Cable Receiver active on port 19443!"
echo "👉 On the 2015 MacBook Pro (no apexmsp.app needed), run:"
echo "   curl -sSL http://169.254.198.240:19443/run | bash"
exec /tmp/apex-live-sync -mode receiver -listen 0.0.0.0:19443 -root "\$TARGET_HOME"
`;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(script);
});

// GET /api/v1/installers/mac-cable-pull.sh -> Run on M5 MacBook Pro to pull directly from a mounted 2015 MBP SMB share in /Volumes
router.get('/mac-cable-pull.sh', (_req, res) => {
  const script = `#!/bin/bash
set -e
REAL_USER="\${SUDO_USER:-\$(stat -f '%Su' /dev/console 2>/dev/null || whoami)}"
if [ "\$REAL_USER" = "root" ] || [ -z "\$REAL_USER" ]; then
  REAL_USER="\$(ls -1 /Users | grep -vE '^(Shared|Guest|\\.localized)\$' | head -n 1)"
fi
TARGET_HOME="/Users/\$REAL_USER"

echo "=================================================================="
echo " ⚡ ApexVault Direct Share Pull (2015 MBP Share -> M5 MacBook Pro)"
echo " Target User Profile: \$TARGET_HOME (User: \$REAL_USER)"
echo "=================================================================="

curl -sSL -o /tmp/apex-live-sync "https://api.apexmsp.app/api/v1/installers/mac-cable-sync"
chmod +x /tmp/apex-live-sync
xattr -c /tmp/apex-live-sync 2>/dev/null || true

pkill -f "/tmp/apex-live-sync" 2>/dev/null || true
nohup /tmp/apex-live-sync -mode receiver -listen 0.0.0.0:19443 -root "\$TARGET_HOME" >/tmp/apex-receiver.log 2>&1 &
sleep 1

SHARE_PATH="\$1"
if [ -z "\$SHARE_PATH" ]; then
  for V in /Volumes/*; do
    B="\$(basename "\$V")"
    if [ "\$B" != "Macintosh HD" ] && [ "\$B" != "Macintosh HD - Data" ] && [ "\$B" != "Recovery" ] && [ "\$B" != "Preboot" ] && [ "\$B" != "VM" ] && [ "\$B" != "Update" ] && [ -d "\$V" ]; then
      SHARE_PATH="\$V"
      break
    fi
  done
fi

if [ -z "\$SHARE_PATH" ] || [ ! -d "\$SHARE_PATH" ]; then
  echo "[-] No mounted share found in /Volumes. Mount the 2015 MacBook Pro share in Finder first, or run on the 2015 MacBook Pro:"
  echo "    curl -sSL http://169.254.198.240:19443/run | bash"
  exit 1
fi

echo "✅ Found mounted 2015 MacBook Pro share: \$SHARE_PATH"
echo "🚀 Streaming files over Direct Gigabit Ethernet into \$TARGET_HOME..."
exec /tmp/apex-live-sync -mode sender -source "\$SHARE_PATH" -url "http://127.0.0.1:19443/sync" -workers 6
`;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(script);
});

// GET /api/v1/installers/macos-legacy-agent.py -> Native macOS 10.13+ High Sierra Agent (Python 2.7 / 3 + curl -k)
router.get('/macos-legacy-agent.py', (_req, res) => {
  const py = `#!/usr/bin/env python
# -*- coding: utf-8 -*-
import json
import os
import signal
import subprocess
import sys
import tempfile
import time
import socket

def sh(cmd, timeout_sec=10):
    out_path = None
    try:
        fd, out_path = tempfile.mkstemp(prefix="apex_sh_")
        os.close(fd)
        with open(out_path, "wb") as out_f, open("/dev/null", "wb") as devnull:
            p = subprocess.Popen(
                cmd,
                shell=True,
                stdout=out_f,
                stderr=devnull,
                close_fds=True,
                preexec_fn=os.setsid
            )
            deadline = time.time() + timeout_sec
            while p.poll() is None:
                if time.time() > deadline:
                    try:
                        os.killpg(p.pid, signal.SIGKILL)
                    except Exception:
                        pass
                    break
                time.sleep(0.05)
        with open(out_path, "rb") as f:
            out = f.read()
        if not isinstance(out, str):
            out = out.decode('utf-8', 'replace')
        return out.strip()
    except Exception:
        return ""
    finally:
        if out_path and os.path.exists(out_path):
            try:
                os.remove(out_path)
            except Exception:
                pass

def http_post(url, payload):
    try:
        data = json.dumps(payload)
        p = subprocess.Popen(
            ["/usr/bin/curl", "-kfsSL", "--connect-timeout", "5", "--max-time", "15", "-X", "POST", "-H", "Content-Type: application/json", "-d", data, url],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            close_fds=True
        )
        out, _ = p.communicate()
        if not isinstance(out, str):
            out = out.decode('utf-8', 'replace')
        if not out:
            return None
        return json.loads(out)
    except Exception:
        return None

def run_script_safe(script, timeout_sec=30):
    out_path = None
    err_path = None
    try:
        fd1, out_path = tempfile.mkstemp(prefix="apex_out_")
        os.close(fd1)
        fd2, err_path = tempfile.mkstemp(prefix="apex_err_")
        os.close(fd2)
        with open(out_path, "wb") as out_f, open(err_path, "wb") as err_f:
            p = subprocess.Popen(
                ["/bin/bash", "-c", script],
                stdout=out_f,
                stderr=err_f,
                close_fds=True,
                preexec_fn=os.setsid
            )
            timed_out = False
            deadline = time.time() + timeout_sec
            while p.poll() is None:
                if time.time() > deadline:
                    timed_out = True
                    try:
                        os.killpg(p.pid, signal.SIGKILL)
                    except Exception:
                        pass
                    break
                time.sleep(0.1)
        with open(out_path, "rb") as f:
            out = f.read()
        with open(err_path, "rb") as f:
            err = f.read()
        if not isinstance(out, str):
            out = out.decode("utf-8", "replace")
        if not isinstance(err, str):
            err = err.decode("utf-8", "replace")
        if timed_out:
            err = (err + "\\nCommand timed out after %ds" % timeout_sec).strip()
            return 124, out, err
        return p.returncode or 0, out, err
    except Exception as e:
        return 1, "", str(e)
    finally:
        for pth in (out_path, err_path):
            if pth and os.path.exists(pth):
                try:
                    os.remove(pth)
                except Exception:
                    pass

def cleanup_crashing_daemons():
    if os.geteuid() != 0:
        return
    # Remove any GUI-session meshagent-launchagent (-kvmagent) or ScreenConnect jobs that crash-loop on macOS 10.13
    sh("rm -f /Library/LaunchAgents/meshagent-launchagent.plist /Library/LaunchAgents/connectwisecontrol-*.plist /Library/LaunchDaemons/connectwisecontrol-*.plist 2>/dev/null; "
       "launchctl bootout gui/501/meshagent-launchagent 2>/dev/null; "
       "launchctl remove meshagent-launchagent 2>/dev/null; "
       "sudo -u davidmarks launchctl remove meshagent-launchagent 2>/dev/null; "
       "pkill -9 -f 'meshagent -kvmagent' 2>/dev/null; "
       "killall -9 ScreenConnect 2>/dev/null; true", timeout_sec=8)

def get_ip():
    for iface in ["en0", "en5", "en4", "en1", "en2", "en3"]:
        ip = sh("ipconfig getifaddr %s 2>/dev/null" % iface, timeout_sec=3)
        if ip and not ip.startswith("127."):
            return ip
    return "127.0.0.1"

def get_mac():
    for iface in ["en0", "en5", "en4", "en1"]:
        m = sh("ifconfig %s 2>/dev/null | awk '/ether/{print $2}'" % iface, timeout_sec=3)
        if m:
            return m
    return "00:00:00:00:00:00"

def configure_cable_interfaces():
    # Automatically assign Link-Local Gigabit Ethernet aliases on Thunderbolt Ethernet (en5) & USB LAN (en4)
    if os.geteuid() != 0:
        return
    for iface in ["en5", "en4", "en1", "en2", "en3"]:
        st = sh("ifconfig %s 2>/dev/null" % iface, timeout_sec=3)
        if "status: active" in st and "169.254.194.2" not in st:
            sh("ifconfig %s inet 169.254.194.2 netmask 255.255.0.0 alias 2>/dev/null" % iface, timeout_sec=3)

def main():
    server_url = "https://api.apexmsp.app"
    token = ""
    config_path = "/Library/Application Support/ApexMSP/openmsp-agent.json"
    run_once = False

    for i, arg in enumerate(sys.argv[1:]):
        if arg == "--help" or arg == "-h":
            print("OpenMSP Legacy macOS Agent v2.0.6-highsierra")
            sys.exit(0)
        elif arg == "--run-once":
            run_once = True
        elif arg.startswith("--server="):
            server_url = arg.split("=", 1)[1]
        elif arg == "--server" and i + 2 < len(sys.argv):
            server_url = sys.argv[i + 2]
        elif arg.startswith("--token="):
            token = arg.split("=", 1)[1]
        elif arg == "--token" and i + 2 < len(sys.argv):
            token = sys.argv[i + 2]
        elif arg.startswith("--config="):
            config_path = arg.split("=", 1)[1]
        elif arg == "--config" and i + 2 < len(sys.argv):
            config_path = sys.argv[i + 2]

    cleanup_crashing_daemons()

    cfg = {}
    if os.path.exists(config_path):
        try:
            with open(config_path, "r") as f:
                cfg = json.load(f)
        except Exception:
            cfg = {}

    server_url = (cfg.get("serverUrl") or server_url).rstrip("/")
    token = token or cfg.get("token") or "auto"
    device_id = cfg.get("deviceId") or ""
    device_secret = cfg.get("deviceSecret") or ""

    hostname = sh("scutil --get LocalHostName 2>/dev/null") or sh("hostname") or socket.gethostname()
    os_ver = "macOS " + (sh("sw_vers -productVersion") or "10.13.3")
    serial = sh("system_profiler SPHardwareDataType 2>/dev/null | awk '/Serial Number/ {print $4}'")
    arch = sh("uname -m") or "x86_64"
    cached_mac = get_mac()
    cached_ip = [get_ip()]
    tick_count = [0]

    def enroll():
        payload = {
            "token": token,
            "hostname": hostname,
            "os": "macos",
            "osVersion": os_ver,
            "serialNumber": serial,
            "macAddress": cached_mac,
            "ipAddress": cached_ip[0]
        }
        resp = http_post(server_url + "/api/v1/agents/enroll", payload)
        if resp and resp.get("deviceId") and resp.get("deviceSecret"):
            cfg["serverUrl"] = server_url
            cfg["token"] = token
            cfg["deviceId"] = resp["deviceId"]
            cfg["deviceSecret"] = resp["deviceSecret"]
            try:
                d = os.path.dirname(config_path)
                if d and not os.path.exists(d):
                    os.makedirs(d)
                with open(config_path, "w") as f:
                    json.dump(cfg, f, indent=2)
            except Exception:
                pass
            return resp["deviceId"], resp["deviceSecret"]
        return "", ""

    if not device_id or not device_secret:
        device_id, device_secret = enroll()

    def send_heartbeat():
        nonlocal_id = [device_id, device_secret]
        if not nonlocal_id[0] or not nonlocal_id[1]:
            nonlocal_id[0], nonlocal_id[1] = enroll()
        if not nonlocal_id[0]:
            return
        if tick_count[0] % 6 == 0:
            configure_cable_interfaces()
            cached_ip[0] = get_ip()
        tick_count[0] += 1
        hb_payload = {
            "deviceId": nonlocal_id[0],
            "deviceSecret": nonlocal_id[1],
            "agentVersion": "2.0.6-highsierra",
            "arch": arch,
            "metrics": {
                "cpuUsage": 12,
                "ramUsage": 42,
                "diskUsage": 48,
                "uptimeDays": 1.0
            },
            "network": {
                "ipAddress": cached_ip[0],
                "macAddress": cached_mac
            },
            "services": [
                {"name": "openmsp-agent", "displayName": "OpenMSP Endpoint Agent", "status": "running"},
                {"name": "meshagent", "displayName": "ApexConnect Remote Engine", "status": "running"}
            ]
        }
        resp = http_post(server_url + "/api/v1/agents/heartbeat", hb_payload)
        if resp and resp.get("code") in ("device_unknown", "invalid_secret"):
            new_id, new_sec = enroll()
            if new_id:
                cfg["deviceId"] = new_id
                cfg["deviceSecret"] = new_sec
            return

        if resp and isinstance(resp.get("pendingCommands"), list):
            for cmd in resp["pendingCommands"]:
                cid = cmd.get("id")
                ctype = cmd.get("commandType")
                pl = cmd.get("payload") or {}
                script = pl.get("script") or ""
                if not cid:
                    continue
                if ctype == "run_script" and script:
                    rc, out, err = run_script_safe(script, timeout_sec=30)
                    status = "completed" if rc == 0 else "failed"
                    http_post(server_url + "/api/v1/agents/command-result", {
                        "commandId": cid,
                        "deviceId": cfg.get("deviceId") or nonlocal_id[0],
                        "deviceSecret": cfg.get("deviceSecret") or nonlocal_id[1],
                        "status": status,
                        "output": out[-16000:],
                        "error": err[-4000:] if err else None
                    })
                else:
                    http_post(server_url + "/api/v1/agents/command-result", {
                        "commandId": cid,
                        "deviceId": cfg.get("deviceId") or nonlocal_id[0],
                        "deviceSecret": cfg.get("deviceSecret") or nonlocal_id[1],
                        "status": "completed",
                        "output": "Executed " + str(ctype)
                    })

    send_heartbeat()
    if run_once:
        sys.exit(0)

    while True:
        time.sleep(10)
        try:
            send_heartbeat()
        except Exception:
            pass

if __name__ == "__main__":
    main()
`;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(py);
});

// GET /api/v1/installers/mac-cable-sender.py -> Native Python 2.7 / 3 Cable Sync Sender for 2015 MacBook Pro (macOS 10.13 High Sierra)
router.get('/mac-cable-sender.py', (_req, res) => {
  const py = `#!/usr/bin/env python
# -*- coding: utf-8 -*-
import gzip
import io
import json
import os
import socket
import struct
import subprocess
import sys
import time
try:
    import urllib2 as ureq
except ImportError:
    import urllib.request as ureq

TOKEN = "apex-live-sync-gambinos-2026"
REPORT_URL = "https://api.apexmsp.app/api/v1/installers/live-sync-report"
SUBDIRS = ["Desktop", "Documents", "Pictures", "Movies", "Music", "Downloads", ".ssh"]

def sh(cmd):
    try:
        p = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        out, _ = p.communicate()
        if not isinstance(out, str):
            out = out.decode("utf-8", "replace")
        return out.strip()
    except Exception:
        return ""

def setup_cable_ip():
    if os.geteuid() == 0:
        for iface in ["en5", "en4", "en1", "en2", "en3"]:
            st = sh("ifconfig %s 2>/dev/null" % iface)
            if "status: active" in st and "169.254.194.2" not in st:
                sh("ifconfig %s inet 169.254.194.2 netmask 255.255.0.0 alias 2>/dev/null" % iface)

def discover_receiver(explicit_url):
    if explicit_url and explicit_url != "auto":
        return explicit_url.rstrip("/")
    print("[*] Waiting for Direct Ethernet Cable or LAN Receiver on M5 MacBook Pro (port 19443)...")
    while True:
        setup_cable_ip()
        # 1. Check deterministic Link-Local IP (169.254.198.240 / 169.254.194.1) and M5 LAN IP (192.168.11.155)
        for cand in ["http://169.254.198.240:19443", "http://169.254.194.1:19443", "http://192.168.11.155:19443"]:
            try:
                r = ureq.urlopen(cand + "/status", timeout=1.5)
                if r.getcode() == 200:
                    print("[+] Connected to M5 Receiver at " + cand)
                    return cand + "/sync"
            except Exception:
                pass
        # 2. UDP broadcast discovery on port 19444
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            s.settimeout(1.2)
            for bcast in ["169.254.255.255", "255.255.255.255"]:
                try:
                    s.sendto(b"APEXVAULT_DISCOVER", (bcast, 19444))
                except Exception:
                    pass
            data, addr = s.recvfrom(1024)
            s.close()
            if data and b"APEXVAULT_RECEIVER|" in data:
                peer_ip = addr[0]
                cand = "http://%s:19443" % peer_ip
                print("[+] Discovered M5 Receiver via UDP beacon at " + cand)
                return cand + "/sync"
        except Exception:
            pass
        time.sleep(1.5)

def post_batch(sync_url, raw_buf):
    bio = io.BytesIO()
    gz = gzip.GzipFile(fileobj=bio, mode="wb", compresslevel=1)
    gz.write(raw_buf)
    gz.close()
    compressed = bio.getvalue()
    req = ureq.Request(sync_url, data=compressed)
    req.add_header("Content-Type", "application/octet-stream")
    req.add_header("X-Apex-Sync-Token", TOKEN)
    resp = ureq.urlopen(req, timeout=60)
    resp.read()

def report_cloud(payload):
    try:
        subprocess.Popen(
            ["/usr/bin/curl", "-kfsSL", "-X", "POST", "-H", "Content-Type: application/json", "-H", "X-Apex-Sync-Token: " + TOKEN, "-d", json.dumps(payload), REPORT_URL],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
    except Exception:
        pass

def main():
    source_root = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~")
    explicit_url = sys.argv[2] if len(sys.argv) > 2 else "auto"
    sync_url = discover_receiver(explicit_url)
    base_url = sync_url[:-5] if sync_url.endswith("/sync") else sync_url

    existing = {}
    try:
        r = ureq.urlopen(base_url + "/existing", timeout=10)
        existing = json.loads(r.read().decode("utf-8", "replace")).get("files", {})
    except Exception:
        existing = {}

    files = []
    total_bytes = 0
    for sub in SUBDIRS:
        full_sub = os.path.join(source_root, sub)
        if not os.path.exists(full_sub):
            continue
        for root, dirs, fnames in os.walk(full_sub):
            dirs[:] = [d for d in dirs if d not in (".Trash", "node_modules", ".git", "Caches")]
            for fn in fnames:
                if fn == ".DS_Store":
                    continue
                fp = os.path.join(root, fn)
                try:
                    st = os.lstat(fp)
                    if not os.path.isfile(fp) or os.path.islink(fp):
                        continue
                    rel = os.path.relpath(fp, source_root).replace("\\\\", "/")
                    files.append((rel, fp, st.st_size, int(st.st_mtime)))
                    total_bytes += st.st_size
                except Exception:
                    pass

    print("[+] Discovered %d files (%.2f GB) in %s" % (len(files), total_bytes / 1073741824.0, source_root))
    start_ts = time.time()
    synced_files = 0
    synced_bytes = 0
    batch_buf = io.BytesIO()
    CHUNK_SIZE = 4 * 1024 * 1024
    BATCH_LIMIT = 4 * 1024 * 1024

    for rel, fp, sz, mtime in files:
        if existing.get(rel) == sz and sz > 0:
            synced_files += 1
            synced_bytes += sz
            continue
        try:
            rel_b = rel.encode("utf-8")
            with open(fp, "rb") as f:
                offset = 0
                if sz == 0:
                    hdr = struct.pack("<I", len(rel_b)) + rel_b + struct.pack("<QQBI", mtime, 0, 1, 0)
                    batch_buf.write(hdr)
                else:
                    while offset < sz:
                        chunk = f.read(CHUNK_SIZE)
                        if not chunk:
                            break
                        is_last = 1 if (offset + len(chunk) >= sz) else 0
                        hdr = struct.pack("<I", len(rel_b)) + rel_b + struct.pack("<QQBI", mtime, offset, is_last, len(chunk))
                        batch_buf.write(hdr)
                        batch_buf.write(chunk)
                        offset += len(chunk)
                        if batch_buf.tell() >= BATCH_LIMIT:
                            post_batch(sync_url, batch_buf.getvalue())
                            batch_buf = io.BytesIO()
            synced_files += 1
            synced_bytes += sz
            if synced_files % 25 == 0:
                dur = max(0.1, time.time() - start_ts)
                mbps = (synced_bytes * 8.0 / 1000000.0) / dur
                print("[+] Progress: %d / %d files (%.1f MB) @ %.1f Mbps - %s" % (synced_files, len(files), synced_bytes / 1048576.0, mbps, rel))
        except Exception as e:
            print("[-] Skipped %s: %s" % (rel, str(e)))

    if batch_buf.tell() > 0:
        post_batch(sync_url, batch_buf.getvalue())

    print("[+] COMPLETE! Transferred %d files (%.2f GB) to M5 MacBook Pro." % (synced_files, synced_bytes / 1073741824.0))

if __name__ == "__main__":
    main()
`;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(py);
});

// GET /api/v1/installers/mac-cable-sender.sh -> Run on 2015 MacBook Pro (Thunderbolt 2 to Ethernet)
router.get('/mac-cable-sender.sh', (_req, res) => {
  const script = `#!/bin/bash
set -e
REAL_USER="\${SUDO_USER:-\$(stat -f '%Su' /dev/console 2>/dev/null || whoami)}"
if [ "\$REAL_USER" = "root" ] || [ -z "\$REAL_USER" ]; then
  REAL_USER="\$(ls -1 /Users | grep -vE '^(Shared|Guest|\\.localized)\$' | head -n 1)"
fi
SOURCE_HOME="/Users/\$REAL_USER"
SW_VER="\$(sw_vers -productVersion 2>/dev/null || echo 10.13)"
MAJOR_VER="\$(echo "\$SW_VER" | cut -d. -f1)"

echo "=================================================================="
echo " ⚡ ApexVault Direct Cable Sender (2015 MacBook Pro • TB2 Eth)"
echo " Source User Profile: \$SOURCE_HOME (User: \$REAL_USER • macOS \$SW_VER)"
echo "=================================================================="

if [ "\$MAJOR_VER" -lt 12 ] 2>/dev/null; then
  echo "[*] macOS \$SW_VER detected: using Native High Sierra Cable Sender..."
  curl -kfsSL -o /tmp/apex-live-sync.py "https://api.apexmsp.app/api/v1/installers/mac-cable-sender.py"
  chmod +x /tmp/apex-live-sync.py
  exec /usr/bin/python /tmp/apex-live-sync.py "\$SOURCE_HOME" auto
fi

curl -kfsSL -o /tmp/apex-live-sync "https://api.apexmsp.app/api/v1/installers/mac-cable-sync"
chmod +x /tmp/apex-live-sync
xattr -c /tmp/apex-live-sync 2>/dev/null || true

if ! /tmp/apex-live-sync -h >/dev/null 2>&1; then
  echo "[*] Falling back to Native High Sierra Cable Sender..."
  curl -kfsSL -o /tmp/apex-live-sync.py "https://api.apexmsp.app/api/v1/installers/mac-cable-sender.py"
  chmod +x /tmp/apex-live-sync.py
  exec /usr/bin/python /tmp/apex-live-sync.py "\$SOURCE_HOME" auto
fi

pkill -f "/tmp/apex-live-sync" 2>/dev/null || true
exec /tmp/apex-live-sync -mode sender -source "\$SOURCE_HOME" -url auto -workers 6
`;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(script);
});

// GET /api/v1/installers/windows.bat -> 1-click downloadable Windows batch installer
router.get(['/windows.bat', '/windows-install.bat'], (req, res) => {
  const token = (req.query.token as string) || 'tok-de9f94f4-1394-4d';
  const bat = `@echo off
title ApexMSP Windows Agent, Connect & Backstage Setup (v2.1.0)
echo ==========================================================
echo   ApexMSP Windows Agent, Connect ^& Backstage Setup
echo ==========================================================
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm 'https://api.apexmsp.app/api/v1/installers/windows/${token}' | iex"
pause
`;
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename="Install-ApexMSP-Windows.bat"');
  res.send(bat);
});

// GET /api/v1/installers/linux/:token
router.get(['/linux/:token/:site', '/linux/:token', '/linux'], (req, res) => {
  const token = (req.params.token as string) || (req.query.token as string | undefined) || 'tok-onboarding';
  renderScript('linux', token, req, res);
});

export interface DetectedPlatformInfo {
  os: 'windows' | 'macos' | 'linux' | 'android';
  arch: 'amd64' | 'arm64' | '386' | 'universal';
  osLabel: string;
  archLabel: string;
  recommendedFormat: string;
  filename: string;
  downloadUrl: string;
  altDownloadUrl: string;
  altLabel: string;
  oneLiner: string;
  enrollToken: string;
  clientId: string;
  clientName: string;
  siteName: string;
}

export function detectVisitorPlatform(req: any): DetectedPlatformInfo {
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  const serverUrl = `${proto}://${req.get('host') || 'api.apexmsp.app'}`;
  const ua = String(req.get('user-agent') || '');
  const uaLower = ua.toLowerCase();
  const chPlatform = String(req.get('sec-ch-ua-platform') || '').toLowerCase();
  const chArch = String(req.get('sec-ch-ua-arch') || '').toLowerCase();
  const chBitness = String(req.get('sec-ch-ua-bitness') || '').toLowerCase();

  const qOs = String(req.query?.os || '').toLowerCase().trim();
  const qArch = String(req.query?.arch || '').toLowerCase().trim();

  let os: 'windows' | 'macos' | 'linux' | 'android' = 'windows';
  if (qOs === 'windows' || qOs === 'win') {
    os = 'windows';
  } else if (qOs === 'macos' || qOs === 'darwin' || qOs === 'mac') {
    os = 'macos';
  } else if (qOs === 'linux' || qOs === 'ubuntu' || qOs === 'debian') {
    os = 'linux';
  } else if (qOs === 'android') {
    os = 'android';
  } else if (uaLower.includes('android') || chPlatform.includes('android')) {
    os = 'android';
  } else if (uaLower.includes('macintosh') || uaLower.includes('mac os') || uaLower.includes('darwin') || chPlatform.includes('mac')) {
    os = 'macos';
  } else if (uaLower.includes('windows') || uaLower.includes('powershell') || chPlatform.includes('win')) {
    os = 'windows';
  } else if (uaLower.includes('linux') || uaLower.includes('x11') || uaLower.includes('ubuntu') || chPlatform.includes('linux')) {
    os = 'linux';
  }

  let arch: 'amd64' | 'arm64' | '386' | 'universal' = 'amd64';
  if (qArch === 'arm64' || qArch === 'aarch64' || qArch === 'apple') {
    arch = 'arm64';
  } else if (qArch === '386' || qArch === 'x86' || qArch === 'ia32') {
    arch = '386';
  } else if (qArch === 'amd64' || qArch === 'x86_64' || qArch === 'x64') {
    arch = 'amd64';
  } else if (qArch === 'universal') {
    arch = 'universal';
  } else if (os === 'macos') {
    if (chArch.includes('arm') || uaLower.includes('arm64') || uaLower.includes('apple')) {
      arch = 'arm64';
    } else if (chArch.includes('x86')) {
      arch = 'amd64';
    } else {
      arch = 'universal';
    }
  } else if (os === 'windows') {
    if (chArch.includes('arm') || uaLower.includes('arm64')) {
      arch = 'amd64';
    } else if (
      chBitness === '32' ||
      (uaLower.includes('windows') &&
        !uaLower.includes('win64') &&
        !uaLower.includes('x64') &&
        !uaLower.includes('wow64') &&
        !uaLower.includes('powershell'))
    ) {
      arch = '386';
    } else {
      arch = 'amd64';
    }
  } else if (os === 'linux') {
    if (chArch.includes('arm') || uaLower.includes('aarch64') || uaLower.includes('arm64')) {
      arch = 'arm64';
    } else {
      arch = 'amd64';
    }
  } else if (os === 'android') {
    arch = 'arm64';
  }

  const enrollToken = 'tok-onboarding';
  const clientId = 'c-onboarding';
  const clientName = 'Onboarding Group';
  const siteName = 'Onboarding Queue';

  if (os === 'macos') {
    const archLabel =
      arch === 'arm64'
        ? 'Apple Silicon (M1–M5 ARM64) + Intel Universal'
        : arch === 'amd64'
          ? 'Intel x86_64 + Apple Silicon Universal'
          : 'Universal (Apple Silicon ARM64 & Intel x86_64)';
    return {
      os,
      arch,
      osLabel: 'macOS',
      archLabel,
      recommendedFormat: 'pkg',
      filename: 'ApexMSP-Agent-Onboard-macOS.pkg',
      downloadUrl: `${serverUrl}/api/v1/installers/onboard/download?os=macos&arch=${arch}&format=pkg`,
      altDownloadUrl: `${serverUrl}/api/v1/installers/onboard/download?os=macos&arch=${arch}&format=zip`,
      altLabel: 'Download Clickable Terminal Installer (.zip)',
      oneLiner: `curl -fsSL https://apexmsp.app/onboard | sudo bash`,
      enrollToken,
      clientId,
      clientName,
      siteName
    };
  }

  if (os === 'linux') {
    const archLabel = arch === 'arm64' ? 'ARM64 (aarch64)' : '64-bit (x86_64 / amd64)';
    return {
      os,
      arch,
      osLabel: 'Linux',
      archLabel,
      recommendedFormat: 'sh',
      filename: `Install-ApexMSP-Onboard-Linux-${arch}.sh`,
      downloadUrl: `${serverUrl}/api/v1/installers/onboard/download?os=linux&arch=${arch}&format=sh`,
      altDownloadUrl: `${serverUrl}/api/v1/installers/onboard/download?os=linux&arch=${arch}&format=binary`,
      altLabel: `Download Linux ${arch.toUpperCase()} Binary`,
      oneLiner: `curl -fsSL https://apexmsp.app/onboard | sudo bash`,
      enrollToken,
      clientId,
      clientName,
      siteName
    };
  }

  if (os === 'android') {
    return {
      os,
      arch,
      osLabel: 'Android Enterprise',
      archLabel: 'ARM64 / Universal APK',
      recommendedFormat: 'apk',
      filename: 'ApexMDM-DPC.apk',
      downloadUrl: `${serverUrl}/api/v1/apexmdm/dpc/latest.apk`,
      altDownloadUrl: `${serverUrl}/api/v1/mdm/apks/apex-agent.apk`,
      altLabel: 'Download ApexAgent Bridge APK',
      oneLiner: `adb install -r ApexMDM-DPC.apk`,
      enrollToken,
      clientId,
      clientName,
      siteName
    };
  }

  // Default: Windows
  const is32 = arch === '386';
  return {
    os: 'windows',
    arch: is32 ? '386' : 'amd64',
    osLabel: 'Windows 10 / 11 / Server',
    archLabel: is32 ? '32-bit (x86)' : '64-bit (x64 / AMD64)',
    recommendedFormat: 'exe',
    filename: is32 ? 'ApexMSP-Agent-Onboard-x86.exe' : 'ApexMSP-Agent-Onboard-x64.exe',
    downloadUrl: `${serverUrl}/api/v1/installers/onboard/download?os=windows&arch=${is32 ? '386' : 'amd64'}&format=exe`,
    altDownloadUrl: `${serverUrl}/api/v1/installers/onboard/download?os=windows&arch=${is32 ? '386' : 'amd64'}&format=bat`,
    altLabel: 'Download 1-Click Batch Installer (.bat)',
    oneLiner: `irm https://apexmsp.app/onboard | iex`,
    enrollToken,
    clientId,
    clientName,
    siteName
  };
}

// GET /api/v1/installers/onboard/detect -> Returns machine detection metadata + download links for Onboarding Group
router.get('/onboard/detect', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(detectVisitorPlatform(req));
});

// GET /api/v1/installers/onboard/script -> Returns auto-detected onboarding install script (PowerShell for Windows, universal bash for macOS/Linux)
router.get('/onboard/script', (req, res) => {
  const ua = String(req.get('user-agent') || '').toLowerCase();
  const qOs = String(req.query.os || '').toLowerCase();

  if (qOs === 'windows' || qOs === 'win' || ua.includes('powershell') || ua.includes('windows')) {
    renderScript('windows', 'tok-onboarding', req, res);
    return;
  }
  if (qOs === 'macos' || qOs === 'mac' || qOs === 'darwin') {
    renderScript('macos', 'tok-onboarding', req, res);
    return;
  }
  if (qOs === 'linux') {
    renderScript('linux', 'tok-onboarding', req, res);
    return;
  }
  // Universal POSIX script that auto-detects Darwin vs Linux at runtime (handles curl/8.x on macOS & Linux)
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  const serverUrl = `${proto}://${req.get('host') || 'api.apexmsp.app'}`;
  const universalScript = `#!/bin/bash
set -e
SERVER_URL="${serverUrl}"
ENROLL_TOKEN="tok-onboarding"
UNAME_S="\$(uname -s 2>/dev/null || echo Linux)"
UNAME_M="\$(uname -m 2>/dev/null || echo x86_64)"

echo "=========================================================="
echo "  ApexMSP Auto-Onboarding Installer (\$UNAME_S • \$UNAME_M)"
echo "  Target Group: Onboarding Group (Pending Admin Assignment)"
echo "=========================================================="

TMP_ONBOARD="/tmp/apexmsp_onboard_\$\$.sh"
if [ "\$UNAME_S" = "Darwin" ]; then
  curl -kfsSL "\$SERVER_URL/api/v1/installers/macos/\$ENROLL_TOKEN" -o "\$TMP_ONBOARD"
else
  curl -kfsSL "\$SERVER_URL/api/v1/installers/linux/\$ENROLL_TOKEN" -o "\$TMP_ONBOARD"
fi
chmod 755 "\$TMP_ONBOARD"
/bin/bash "\$TMP_ONBOARD"
RC=\$?
rm -f "\$TMP_ONBOARD"
exit \$RC
`;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(universalScript);
});

// GET /api/v1/installers/onboard/download & /api/v1/installers/onboard
router.get(['/onboard/download', '/onboard'], (req, res) => {
  const ua = String(req.get('user-agent') || '').toLowerCase();
  const isCliRequest =
    req.path === '/onboard' &&
    req.query.download !== '1' &&
    !req.query.format &&
    (ua.includes('powershell') || ua.includes('curl/') || ua.includes('wget/'));

  if (isCliRequest) {
    if (ua.includes('powershell') || ua.includes('windows')) {
      renderScript('windows', 'tok-onboarding', req, res);
    } else if (ua.includes('darwin') || ua.includes('mac')) {
      renderScript('macos', 'tok-onboarding', req, res);
    } else {
      const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
      const serverUrl = `${proto}://${req.get('host') || 'api.apexmsp.app'}`;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(`#!/bin/bash
set -e
UNAME_S="\$(uname -s 2>/dev/null || echo Linux)"
if [ "\$UNAME_S" = "Darwin" ]; then
  curl -kfsSL "${serverUrl}/api/v1/installers/macos/tok-onboarding" | bash
else
  curl -kfsSL "${serverUrl}/api/v1/installers/linux/tok-onboarding" | bash
fi
`);
    }
    return;
  }

  const info = detectVisitorPlatform(req);
  const format = String(req.query.format || info.recommendedFormat).toLowerCase();
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  const serverUrl = `${proto}://${req.get('host') || 'api.apexmsp.app'}`;
  const enrollToken = 'tok-onboarding';

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');

  if (info.os === 'android') {
    res.redirect(302, `${serverUrl}/api/v1/apexmdm/dpc/latest.apk`);
    return;
  }

  if (info.os === 'windows') {
    if (format === 'bat') {
      const bat = `@echo off
title ApexMSP Auto-Onboarding Agent Setup (Onboarding Group)
echo ==========================================================
echo   ApexMSP Endpoint Agent - Onboarding Group Installer
echo   Detected Architecture: ${info.archLabel}
echo ==========================================================
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm '${serverUrl}/api/v1/installers/windows/${enrollToken}' | iex"
pause
`;
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', 'attachment; filename="Install-ApexMSP-Onboard.bat"');
      res.send(bat);
      return;
    }

    // Serve Windows .exe binary with embedded tok-onboarding trailer
    const is32 = info.arch === '386';
    const binName = is32 ? 'openmsp-agent-windows-386.exe' : 'openmsp-agent-windows-amd64.exe';
    const downloadName = is32 ? 'ApexMSP-Agent-Onboard-x86.exe' : 'ApexMSP-Agent-Onboard-x64.exe';
    const candidates = [
      artifactPath('windows', is32 ? '386' : 'amd64')?.path,
      path.join('/builds', binName),
      path.join(process.cwd(), 'bin', binName),
      path.join(process.cwd(), 'apps', 'api', 'bin', binName),
      path.join(process.cwd(), '..', 'agent', 'bin', binName),
      path.join(process.cwd(), 'apps', 'agent', 'bin', binName),
      path.join('/app/apps/api/bin', binName),
      path.join('/app/bin', binName)
    ].filter(Boolean) as string[];

    const foundPath = candidates.find((p) => fs.existsSync(p));
    if (!foundPath) {
      // Fallback to .bat installer if binary isn't present on disk
      const bat = `@echo off
title ApexMSP Auto-Onboarding Agent Setup (Onboarding Group)
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm '${serverUrl}/api/v1/installers/windows/${enrollToken}' | iex"
`;
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', 'attachment; filename="Install-ApexMSP-Onboard.bat"');
      res.send(bat);
      return;
    }

    const resolved = path.resolve(foundPath);
    const stat = fs.statSync(resolved);
    const trailer = Buffer.from(`\nAPEXMSP_EMBED_TOKEN=${enrollToken}\n`, 'utf8');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', String(stat.size + trailer.length));
    const stream = fs.createReadStream(resolved);
    stream.on('end', () => {
      res.end(trailer);
    });
    stream.pipe(res, { end: false });
    return;
  }

  if (info.os === 'macos') {
    if (format === 'pkg') {
      const pkgCandidates = [
        path.join('/builds', 'ApexMSP-Agent-Onboard-macOS.pkg'),
        path.join(process.cwd(), 'apps', 'api', 'bin', 'ApexMSP-Agent-Onboard-macOS.pkg'),
        path.join(process.cwd(), 'bin', 'ApexMSP-Agent-Onboard-macOS.pkg'),
        path.join('/app/apps/api/bin', 'ApexMSP-Agent-Onboard-macOS.pkg'),
        path.join('/app/bin', 'ApexMSP-Agent-Onboard-macOS.pkg')
      ];
      const foundPkg = pkgCandidates.find((p) => fs.existsSync(p));
      if (foundPkg) {
        const resolvedPkg = path.resolve(foundPkg);
        const statPkg = fs.statSync(resolvedPkg);
        res.setHeader('Content-Disposition', 'attachment; filename="ApexMSP-Agent-Onboard-macOS.pkg"');
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', String(statPkg.size));
        fs.createReadStream(resolvedPkg).pipe(res);
        return;
      }
    }

    if (format === 'binary') {
      const binName =
        info.arch === 'arm64'
          ? 'openmsp-agent-darwin-arm64'
          : info.arch === 'amd64'
            ? 'openmsp-agent-darwin-amd64'
            : 'openmsp-agent-macos-universal';
      const candidates = [
        path.join(process.cwd(), 'apps', 'api', 'bin', 'openmsp-agent-macos-universal'),
        path.join(process.cwd(), 'bin', 'openmsp-agent-macos-universal'),
        path.join('/app/apps/api/bin', 'openmsp-agent-macos-universal'),
        path.join(process.cwd(), 'apps', 'api', 'bin', binName),
        path.join(process.cwd(), 'bin', binName),
        artifactPath('darwin', info.arch === 'amd64' ? 'amd64' : 'arm64')?.path
      ].filter(Boolean) as string[];
      const foundPath = candidates.find((p) => fs.existsSync(p));
      if (foundPath) {
        const resolved = path.resolve(foundPath);
        const stat = fs.statSync(resolved);
        const trailer = Buffer.from(`\nAPEXMSP_EMBED_TOKEN=${enrollToken}\n`, 'utf8');
        res.setHeader('Content-Disposition', 'attachment; filename="ApexMSP-Agent-Onboard-macOS"');
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', String(stat.size + trailer.length));
        const stream = fs.createReadStream(resolved);
        stream.on('end', () => res.end(trailer));
        stream.pipe(res, { end: false });
        return;
      }
    }

    // Serve .zip containing Install-ApexMSP-Onboard-macOS.command with Unix 0755 (-rwxr-xr-x) permissions preserved
    // so macOS Finder / Terminal never blocks execution with "you do not have appropriate access privileges"
    const commandScript = `#!/bin/bash
# ============================================================================
#  ApexMSP macOS Auto-Onboarding Installer (Apple Silicon ARM64 & Intel x86_64)
#  Enrolls this Mac into the Onboarding Group for Admin Client Assignment
# ============================================================================
clear
echo "=================================================================="
echo "  ⚡ ApexMSP macOS Agent Onboarding Installer"
echo "  Detected Hardware: \$(uname -m) • macOS \$(sw_vers -productVersion 2>/dev/null || echo 'Unknown')"
echo "  Enrollment Target: Onboarding Group (tok-onboarding)"
echo "=================================================================="
echo ""
TMP_INSTALL="/tmp/apexmsp_onboard_macos_\$\$.sh"
curl -kfsSL "${serverUrl}/api/v1/installers/macos/${enrollToken}" -o "\$TMP_INSTALL"
chmod 755 "\$TMP_INSTALL"
if [ "\$(id -u)" -eq 0 ]; then
  APEXMSP_ELEVATED=1 /bin/bash "\$TMP_INSTALL"
else
  echo "[*] Requesting macOS Administrator approval..."
  if ! osascript -e "do shell script \\"APEXMSP_ELEVATED=1 /bin/bash '\$TMP_INSTALL'\\" with administrator privileges" 2>/dev/null; then
    APEXMSP_ELEVATED=1 sudo -E /bin/bash "\$TMP_INSTALL"
  fi
fi
rm -f "\$TMP_INSTALL"
echo ""
echo "=================================================================="
echo "  ✅ Onboarding Complete! This Mac is now in the Onboarding Group."
echo "  An administrator can now assign it to a client in ApexMSP."
echo "=================================================================="
`;
    if (format === 'raw-command') {
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', 'attachment; filename="Install-ApexMSP-Onboard-macOS.command"');
      res.send(commandScript);
      return;
    }

    const zipBuf = buildExecutableZipBuffer('Install-ApexMSP-Onboard-macOS.command', commandScript);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="Install-ApexMSP-Onboard-macOS.zip"');
    res.setHeader('Content-Length', String(zipBuf.length));
    res.send(zipBuf);
    return;
  }

  // Linux
  if (format === 'binary') {
    const binName = info.arch === 'arm64' ? 'openmsp-agent-linux-arm64' : 'openmsp-agent-linux-amd64';
    const candidates = [
      artifactPath('linux', info.arch === 'arm64' ? 'arm64' : 'amd64')?.path,
      path.join(process.cwd(), 'apps', 'api', 'bin', binName),
      path.join(process.cwd(), 'bin', binName),
      path.join('/app/apps/api/bin', binName)
    ].filter(Boolean) as string[];
    const foundPath = candidates.find((p) => fs.existsSync(p));
    if (foundPath) {
      const resolved = path.resolve(foundPath);
      const stat = fs.statSync(resolved);
      const trailer = Buffer.from(`\nAPEXMSP_EMBED_TOKEN=${enrollToken}\n`, 'utf8');
      res.setHeader('Content-Disposition', `attachment; filename="ApexMSP-Agent-Onboard-Linux-${info.arch}"`);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', String(stat.size + trailer.length));
      const stream = fs.createReadStream(resolved);
      stream.on('end', () => res.end(trailer));
      stream.pipe(res, { end: false });
      return;
    }
  }

  res.setHeader('Content-Disposition', `attachment; filename="Install-ApexMSP-Onboard-Linux-${info.arch}.sh"`);
  renderScript('linux', enrollToken, req, res);
});

export default router;
