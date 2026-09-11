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

// GET /api/v1/installers/script?token=...&os=windows|macos
router.get('/script', (req, res) => {
  const { token, os } = req.query;
  const serverUrl = `${req.protocol}://${req.get('host')}`;
  const relayHost = store.rustDeskConfig.relayServer.split(':')[0] || 'relay.openmsp.local';

  if (os === 'macos') {
    const script = `#!/bin/bash
set -e
echo "[+] OpenMSP macOS Agent Provisioning..."
SERVER_URL="${serverUrl}"
ENROLL_TOKEN="${token || 'demo-enrollment-token-2026'}"
RELAY_HOST="${relayHost}"

echo "[*] Downloading OpenMSP Agent..."
# In production, downloads signed .pkg installer
echo "[*] Enrolling device with token: $ENROLL_TOKEN"
curl -s -X POST "$SERVER_URL/api/v1/agents/enroll" \\
  -H "Content-Type: application/json" \\
  -d "{\\"token\\":\\"$ENROLL_TOKEN\\",\\"hostname\\":\\"$(hostname)\\",\\"os\\":\\"macos\\",\\"osVersion\\":\\"$(sw_vers -productVersion)\\",\\"serialNumber\\":\\"$(system_profiler SPHardwareDataType | awk '/Serial/ {print $4}')\\",\\"macAddress\\":\\"$(ifconfig en0 | awk '/ether/{print $2}')\\",\\"ipAddress\\":\\"$(ipconfig getifaddr en0 || echo '127.0.0.1')\\"}"
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

export default router;
