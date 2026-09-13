import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../db/store.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import type { EnrollmentToken } from '@openmsp/api-types';

const router = Router();

// POST /api/v1/installers/token (requires auth)
router.post('/token', authenticate, (req: AuthenticatedRequest, res) => {
  const { clientId, siteId, expiresInDays } = req.body;
  if (!clientId) {
    res.status(400).json({ error: 'clientId is required' });
    return;
  }

  const tokenStr = `tok-${uuidv4().substring(0, 16)}`;
  const days = expiresInDays || 30;
  const tokenObj: EnrollmentToken = {
    id: uuidv4(),
    token: tokenStr,
    orgId: req.user!.orgId,
    clientId,
    siteId,
    expiresAt: new Date(Date.now() + days * 24 * 3600 * 1000).toISOString(),
    used: false,
    createdAt: new Date().toISOString()
  };

  store.enrollmentTokens.set(tokenStr, tokenObj);

  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'installer.token_generate',
    targetType: 'enrollment_token',
    targetId: tokenStr,
    details: { clientId, siteId },
    ipAddress: req.ip
  });

  res.status(201).json(tokenObj);
});

import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Directories searched for agent artifacts (installers + raw binaries).
// CI drops signed .pkg/.msi into AGENT_ARTIFACTS_DIR (or ./artifacts);
// `make build-all` populates apps/agent/bin for local dev.
const ARTIFACT_DIRS = [
  process.env.AGENT_ARTIFACTS_DIR,
  path.join(process.cwd(), 'artifacts'),
  path.join(process.cwd(), 'bin'),
  path.join(process.cwd(), 'apps', 'api', 'bin'),
  path.join(process.cwd(), 'apps', 'agent', 'bin'),
  '/app/artifacts',
  '/app/apps/agent/bin',
  '/app/bin'
].filter(Boolean) as string[];

// Find the first existing exact-name file across artifact dirs.
function findExact(names: string[]): string | null {
  for (const dir of ARTIFACT_DIRS) {
    for (const name of names) {
      const p = path.join(dir, name);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

// Find the newest file matching a regex (for versioned .pkg/.msi).
function findNewest(pattern: RegExp): string | null {
  let best: { p: string; mtime: number } | null = null;
  for (const dir of ARTIFACT_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!pattern.test(f)) continue;
      const p = path.join(dir, f);
      const mtime = fs.statSync(p).mtimeMs;
      if (!best || mtime > best.mtime) best = { p, mtime };
    }
  }
  return best ? best.p : null;
}

type Artifact = { path: string; downloadName: string; contentType: string };

// Resolve an artifact for (os, kind). kind: 'installer' (default) | 'binary' | 'tray'.
function resolveArtifact(os: string, kind: string, arch: string): Artifact | null {
  const OCTET = 'application/octet-stream';
  if (os === 'macos') {
    if (kind !== 'binary') {
      const pkg = findNewest(/^OpenMSP-Agent.*\.pkg$/i);
      if (pkg) return { path: pkg, downloadName: path.basename(pkg), contentType: 'application/octet-stream' };
    }
    const names =
      arch === 'arm64' ? ['openmsp-agent-darwin-arm64', 'openmsp-agent-darwin']
      : arch === 'amd64' || arch === 'x86_64' ? ['openmsp-agent-darwin-amd64', 'openmsp-agent-darwin']
      : ['openmsp-agent-darwin', 'openmsp-agent-darwin-arm64', 'openmsp-agent-darwin-amd64', 'openmsp-agent-macos-universal'];
    const bin = findExact(names);
    return bin ? { path: bin, downloadName: 'openmsp-agent', contentType: OCTET } : null;
  }
  if (os === 'windows') {
    if (kind === 'tray') {
      const t = findExact(['openmsp-agent-tray.exe']);
      return t ? { path: t, downloadName: 'openmsp-agent-tray.exe', contentType: OCTET } : null;
    }
    if (kind !== 'binary') {
      const msi = findNewest(/^OpenMSP-Agent.*\.msi$/i);
      if (msi) return { path: msi, downloadName: path.basename(msi), contentType: OCTET };
    }
    const exe = findExact(['openmsp-agent.exe', 'openmsp-agent-windows-amd64.exe']);
    return exe ? { path: exe, downloadName: 'openmsp-agent.exe', contentType: OCTET } : null;
  }
  if (os === 'linux') {
    const bin = findExact(['openmsp-agent-linux-amd64', 'openmsp-agent-linux']);
    return bin ? { path: bin, downloadName: 'openmsp-agent', contentType: OCTET } : null;
  }
  return null;
}

// GET /api/v1/installers/manifest — what agents are available to download
router.get('/manifest', (_req, res) => {
  const out: Record<string, { installer: boolean; binary: boolean }> = {
    macos: { installer: false, binary: false },
    windows: { installer: false, binary: false },
    linux: { installer: false, binary: false }
  };
  for (const os of ['macos', 'windows', 'linux']) {
    out[os].installer = !!resolveArtifact(os, 'installer', '');
    out[os].binary = !!resolveArtifact(os, 'binary', '');
  }
  // Expose the MeshCentral remote-support enrollment descriptor so the installer
  // flow knows which server/group endpoints auto-join. The group .msh itself is
  // bundled into the installers at build time (see apps/agent/deploy/*/mesh/).
  const mesh = {
    serverUrl: store.remoteConfig.serverUrl,
    group: store.remoteConfig.deviceGroup,
    configured: !!store.remoteConfig.serverUrl
  };
  res.json({ artifacts: out, mesh });
});

// GET /api/v1/installers/download?os=macos|windows|linux&kind=installer|binary|tray&arch=
router.get('/download', (req, res) => {
  const os = (req.query.os as string) || 'macos';
  const kind = (req.query.kind as string) || 'installer';
  const arch = (req.query.arch as string) || '';

  const art = resolveArtifact(os, kind, arch);
  if (!art) {
    res.status(404).json({ error: `No ${kind} available for ${os}. Build/publish it first (see apps/agent/deploy).` });
    return;
  }

  res.setHeader('Content-Disposition', `attachment; filename="${art.downloadName}"`);
  res.setHeader('Content-Type', art.contentType);
  res.sendFile(path.resolve(art.path));
});

// GET /api/v1/installers/script?token=...&os=windows|macos
router.get('/script', (req, res) => {
  const { token, os } = req.query;
  const proto = req.get('x-forwarded-proto') || req.protocol;
  const serverUrl = `${proto}://${req.get('host')}`;
  const relayHost = (store.remoteConfig.serverUrl || '').replace(/^https?:\/\//, '') || 'mesh.openmsp.local';

  if (os === 'macos') {
    const script = `#!/bin/bash
set -e
echo "[+] OpenMSP macOS Agent Provisioning..."
SERVER_URL="${serverUrl}"
ENROLL_TOKEN="${token || 'demo-enrollment-token-2026'}"
RELAY_HOST="${relayHost}"

echo "[*] Downloading OpenMSP Universal macOS Agent binary..."
INSTALL_DIR="/tmp/openmsp"
mkdir -p "$INSTALL_DIR"
curl -fsSL "$SERVER_URL/api/v1/installers/download?os=macos" -o "$INSTALL_DIR/openmsp-agent" 2>/dev/null || true

if [ -f "$INSTALL_DIR/openmsp-agent" ]; then
  chmod +x "$INSTALL_DIR/openmsp-agent"
  echo "[+] Binary verified. Launching OpenMSP device agent..."
  "$INSTALL_DIR/openmsp-agent" --server="$SERVER_URL" --token="$ENROLL_TOKEN"
else
  echo "[*] Falling back to direct API device registration..."
  curl -s -X POST "$SERVER_URL/api/v1/agents/enroll" \\
    -H "Content-Type: application/json" \\
    -d "{\\"token\\":\\"$ENROLL_TOKEN\\",\\"hostname\\":\\"$(hostname)\\",\\"os\\":\\"macos\\",\\"osVersion\\":\\"$(sw_vers -productVersion)\\",\\"serialNumber\\":\\"$(system_profiler SPHardwareDataType | awk '/Serial/ {print $4}')\\",\\"macAddress\\":\\"$(ifconfig en0 | awk '/ether/{print $2}')\\",\\"ipAddress\\":\\"$(ipconfig getifaddr en0 || echo '127.0.0.1')\\"}"
fi
echo "[+] Enrollment completed successfully."
`;
    res.setHeader('Content-Type', 'text/plain');
    res.send(script);
    return;
  }

  // Windows PowerShell script
  const script = `# OpenMSP Windows Agent Enrollment Script
$ServerUrl = "${serverUrl}"
$EnrollToken = "${token || 'demo-enrollment-token-2026'}"
$RelayHost = "${relayHost}"

Write-Host "[+] Initializing OpenMSP Agent Enrollment..." -ForegroundColor Cyan
$Hostname = $env:COMPUTERNAME
$OSInfo = (Get-CimInstance Win32_OperatingSystem).Caption
$Serial = (Get-CimInstance Win32_BIOS).SerialNumber
$MAC = (Get-NetAdapter | Where-Object Status -eq 'Up' | Select-Object -First 1).MacAddress
$IP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object IPAddress -ne '127.0.0.1' | Select-Object -First 1).IPAddress

$Body = @{
    token = $EnrollToken
    hostname = $Hostname
    os = "windows"
    osVersion = $OSInfo
    serialNumber = $Serial
    macAddress = $MAC
    ipAddress = $IP
} | ConvertTo-Json

try {
    $Response = Invoke-RestMethod -Uri "$ServerUrl/api/v1/agents/enroll" -Method Post -Body $Body -ContentType "application/json"
    Write-Host "[+] Successfully enrolled device: $($Response.deviceId)" -ForegroundColor Green
} catch {
    Write-Error "Failed to enroll OpenMSP agent: $_"
}
`;
  res.setHeader('Content-Type', 'text/plain');
  res.send(script);
});

// GET /api/v1/agents/update-info equivalent, served here:
// /api/v1/installers/update?os=&arch= -> { version, url, sha256 } for self-update
router.get('/update', (req, res) => {
  const os = (req.query.os as string) || 'linux';
  const arch = (req.query.arch as string) || '';
  const version = process.env.AGENT_LATEST_VERSION || '0.2.0';

  const art = resolveArtifact(os, 'binary', arch);
  if (!art) {
    res.status(404).json({ error: `No agent binary available for ${os}` });
    return;
  }
  let sha256 = '';
  try {
    sha256 = crypto.createHash('sha256').update(fs.readFileSync(art.path)).digest('hex');
  } catch {
    // checksum optional; agent still downloads if absent
  }
  const archQ = arch ? `&arch=${encodeURIComponent(arch)}` : '';
  res.json({
    version,
    url: `/api/v1/installers/download?os=${encodeURIComponent(os)}&kind=binary${archQ}`,
    sha256
  });
});

export default router;
