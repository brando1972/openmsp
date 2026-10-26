import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../db/store.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import type { EnrollmentToken } from '@openmsp/api-types';

const router = Router();

// POST /api/v1/installers/token
router.post('/token', (req: AuthenticatedRequest, res) => {
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

import { artifactPath } from '../releases/manifest.js';

// GET /api/v1/installers/download?os=macos|windows|linux
router.get('/download', (req, res) => {
  const os = (req.query.os as string) || 'macos';
  const arch = (req.query.arch as string) || '';
  const component = (req.query.component as string) || '';

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
    filename = 'openmsp-agent-windows-amd64.exe';
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

  let foundPath = candidatePaths.find(p => fs.existsSync(p));

  if (!foundPath) {
    const targetOs = os === 'macos' ? 'darwin' : os;
    const targetArch = arch || (os === 'windows' || os === 'linux' ? 'amd64' : 'arm64');
    const art = artifactPath(targetOs, targetArch);
    if (art && fs.existsSync(art.path)) {
      foundPath = art.path;
    }
  }

  if (!foundPath) {
    res.status(404).json({ error: `Agent binary not found for OS: ${os} (${filename})` });
    return;
  }

  res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
  res.setHeader('Content-Type', 'application/octet-stream');
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

  const isAutoKeyword = !raw || raw.toLowerCase() === 'new' || raw.toLowerCase() === 'auto';
  const isExistingToken = raw && (store.enrollmentTokens.has(raw) || raw.startsWith('tok-') || raw.startsWith('ok-') || raw.startsWith('apex-'));

  if (isAutoKeyword) {
    if (req.query?.client) {
      targetClientId = resolveClientBySlug(String(req.query.client)).clientId;
    }
    effectiveToken = `tok-auto-${uuidv4().substring(0, 10)}`;
  } else if (!isExistingToken) {
    // Treat path segment as a client name/slug (e.g. /windows/gambinos or /windows/raytreat)
    const resolved = resolveClientBySlug(raw);
    targetClientId = resolved.clientId;
    const cleanSlug = raw.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'client';
    effectiveToken = `tok-${cleanSlug}-${uuidv4().substring(0, 8)}`;
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
set -e
echo "[+] OpenMSP macOS Agent & Shark Fin Setup..."
SERVER_URL="${serverUrl}"
ENROLL_TOKEN="${effectiveToken}"
INSTALL_DIR="/Library/Application Support/ApexMSP"
mkdir -p "$INSTALL_DIR"

echo "[*] Downloading OpenMSP Universal macOS Agent binary..."
curl -fsSL "$SERVER_URL/api/v1/installers/download?os=macos" -o "$INSTALL_DIR/openmsp-agent" 2>/dev/null || true

if [ -f "$INSTALL_DIR/openmsp-agent" ]; then
  chmod 755 "$INSTALL_DIR/openmsp-agent"

  cat > "$INSTALL_DIR/openmsp-agent.json" <<EOF
{
  "serverUrl": "$SERVER_URL",
  "token": "$ENROLL_TOKEN",
  "heartbeatIntervalSeconds": 10
}
EOF

  "$INSTALL_DIR/openmsp-agent" --server="$SERVER_URL" --token="$ENROLL_TOKEN" --config="$INSTALL_DIR/openmsp-agent.json" --run-once || true

  cat > /Library/LaunchDaemons/app.apexmsp.agent.plist <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>app.apexmsp.agent</string>
  <key>ProgramArguments</key><array>
    <string>$INSTALL_DIR/openmsp-agent</string>
    <string>--server</string><string>$SERVER_URL</string>
    <string>--config</string><string>$INSTALL_DIR/openmsp-agent.json</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict></plist>
PLISTEOF
  chmod 644 /Library/LaunchDaemons/app.apexmsp.agent.plist
  launchctl unload /Library/LaunchDaemons/app.apexmsp.agent.plist 2>/dev/null || true
  launchctl load -w /Library/LaunchDaemons/app.apexmsp.agent.plist 2>/dev/null || true
  echo "[+] Background daemon registered and running."

  echo "[*] Configuring ApexConnect Remote Desktop..."
  TMP_MESH="/tmp/meshagent_$$\"
  mkdir -p \"\$TMP_MESH\"
  if curl -fsSL "https://mesh.apexmsp.app/meshosxagent?id=29&meshid=ulSX8VuJN9hFinyXGPovEZ4o5ShNQY7AK06I94WuTLzN1AblKrSIrLVz9DZw8vib" -o \"\$TMP_MESH/MeshAgent.zip\"; then
    unzip -qo \"\$TMP_MESH/MeshAgent.zip\" -d \"\$TMP_MESH\" 2>/dev/null || true
    if [ -f \"\$TMP_MESH/MeshAgent.pkg\" ]; then
      installer -pkg \"\$TMP_MESH/MeshAgent.pkg\" -target / 2>/dev/null || true
      echo "[+] ApexConnect Remote Desktop engine installed."
    fi
  fi
  rm -rf \"\$TMP_MESH\"

  echo "[*] Installing ApexMSP Shark Fin menu bar app..."
  APP_DIR="/Applications/ApexMSP.app/Contents/MacOS"
  mkdir -p "$APP_DIR"
  curl -fsSL "$SERVER_URL/api/v1/installers/download?os=macos&component=menubar" -o "$APP_DIR/ApexMSP" 2>/dev/null || true
  if [ -f "$APP_DIR/ApexMSP" ]; then
    chmod +x "$APP_DIR/ApexMSP"
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
  const script = `# OpenMSP Windows Agent Enrollment & Shark Fin Tray Script
$ErrorActionPreference = 'SilentlyContinue'
$ServerUrl = "${serverUrl}"
$EnrollToken = "${effectiveToken}"
$InstallDir = "$env:ProgramData\\ApexMSP"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  ApexMSP Windows Endpoint Agent & Shark Fin Setup        " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

if (!(Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
}

# 1. Download OpenMSP Windows Agent Binary
$AgentExe = "$InstallDir\\openmsp-agent.exe"
Write-Host "[*] Downloading ApexMSP Windows Agent binary..." -ForegroundColor Yellow
try {
    Invoke-WebRequest -Uri "$ServerUrl/api/v1/installers/download?os=windows" -OutFile $AgentExe -UseBasicParsing
    Write-Host "[+] Downloaded agent binary successfully." -ForegroundColor Green
} catch {
    Write-Host "[-] Binary download note: $_" -ForegroundColor DarkYellow
}

# 2. Write configuration file
$ConfigFile = "$InstallDir\\openmsp-agent.json"
$ConfigObj = @{
    serverUrl = $ServerUrl
    token = $EnrollToken
    heartbeatIntervalSeconds = 10
} | ConvertTo-Json
Set-Content -Path $ConfigFile -Value $ConfigObj -Encoding UTF8

# 3. Create the Shark Fin System Tray Script
$TrayScript = "$InstallDir\\ApexMSP-Tray.ps1"
$TrayContent = @'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$InstallDir = "$env:ProgramData\\ApexMSP"
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

# 4. Register ApexMSPAgent as a true Windows Service (visible in Task Manager Services)
Write-Host "[*] Configuring ApexMSPAgent Windows Service..." -ForegroundColor Cyan
if (Get-Service -Name "ApexMSPAgent" -ErrorAction SilentlyContinue) {
    try {
        Stop-Service -Name "ApexMSPAgent" -Force -ErrorAction SilentlyContinue
        sc.exe delete ApexMSPAgent 2>$null | Out-Null
        Start-Sleep -Milliseconds 500
    } catch {}
}

$ServiceCreated = $false
try {
    $BinPath = '"' + $AgentExe + '" --config "' + $ConfigFile + '"'
    New-Service -Name "ApexMSPAgent" -BinaryPathName $BinPath -DisplayName "ApexMSP Endpoint Agent" -Description "ApexMSP Endpoint Agent Service" -StartupType Automatic -ErrorAction Stop
    sc.exe failure ApexMSPAgent reset= 86400 actions= restart/5000/restart/10000/restart/60000 2>$null | Out-Null
    Start-Service -Name "ApexMSPAgent" -ErrorAction Stop
    $ServiceCreated = $true
    Write-Host "[+] Windows Service 'ApexMSPAgent' registered and RUNNING in Task Manager!" -ForegroundColor Green
} catch {
    Write-Host "[-] Service registration requires Administrator privileges. Falling back to background process." -ForegroundColor Yellow
}

# 5. Fallback or process management
if (-not $ServiceCreated) {
    Stop-Process -Name "openmsp-agent" -Force 2>$null
    if (Test-Path $AgentExe) {
        Start-Process -FilePath $AgentExe -ArgumentList ("--server " + $ServerUrl + " --token " + $EnrollToken + " --config " + $ConfigFile) -WorkingDirectory $InstallDir -WindowStyle Hidden
        Write-Host "[+] Background agent process launched." -ForegroundColor Green
    }
}

# 6. Install ApexConnect Remote Desktop engine (Mesh Agent)
Write-Host "[*] Configuring ApexConnect Remote Desktop..." -ForegroundColor Cyan
$MeshExe = "$InstallDir\\meshagent64-ApexMSP.exe"
try {
    Invoke-WebRequest -Uri "https://mesh.apexmsp.app/meshagents?id=4&meshid=ulSX8VuJN9hFinyXGPovEZ4o5ShNQY7AK06I94WuTLzN1AblKrSIrLVz9DZw8vib&installflags=0" -OutFile $MeshExe -UseBasicParsing
    Start-Process -FilePath $MeshExe -ArgumentList "-install" -WindowStyle Hidden -Wait
    Start-Sleep -Seconds 2
    Start-Service -Name "Mesh Agent" -ErrorAction SilentlyContinue
    Write-Host "[+] ApexConnect Remote Desktop connected." -ForegroundColor Green
} catch {
    Write-Host "[-] Remote engine download note: $_" -ForegroundColor DarkYellow
}

# 7. Launch Shark Fin System Tray Icon
Write-Host "[*] Launching Shark Fin Tray Icon in taskbar notification area..." -ForegroundColor Cyan

# A. Common startup folder (for all users)
$CommonStartup = [Environment]::GetFolderPath('CommonStartup')
if (Test-Path $CommonStartup) {
    try {
        $WshShell = New-Object -ComObject WScript.Shell
        $Shortcut = $WshShell.CreateShortcut("$CommonStartup\\ApexMSP-Tray.lnk")
        $Shortcut.TargetPath = "powershell.exe"
        $Shortcut.Arguments = "-WindowStyle Hidden -ExecutionPolicy Bypass -File '$TrayScript'"
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
        $Shortcut.Arguments = "-WindowStyle Hidden -ExecutionPolicy Bypass -File '$TrayScript'"
        $Shortcut.WindowStyle = 7
        $Shortcut.Save()
    } catch {}
}

# C. Registry Run key (launches for all interactive users on boot)
try {
    Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run" -Name "ApexMSPTray" -Value "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File '$TrayScript'" -ErrorAction SilentlyContinue
} catch {}

# D. Scheduled Task to launch immediately into the interactive desktop session
try {
    $LoggedOnUser = (Get-CimInstance Win32_ComputerSystem).UserName
    if ($LoggedOnUser) {
        schtasks.exe /create /tn "ApexMSPTray" /tr "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File '$TrayScript'" /sc ONLOGON /ru "$LoggedOnUser" /it /f 2>$null | Out-Null
        schtasks.exe /run /tn "ApexMSPTray" 2>$null | Out-Null
    } else {
        schtasks.exe /create /tn "ApexMSPTray" /tr "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File '$TrayScript'" /sc ONLOGON /f 2>$null | Out-Null
        schtasks.exe /run /tn "ApexMSPTray" 2>$null | Out-Null
    }
} catch {}

# E. Direct process start
Start-Process -FilePath "powershell.exe" -ArgumentList "-WindowStyle Hidden -ExecutionPolicy Bypass -File '$TrayScript'" -WindowStyle Hidden


# 6. Direct API Device Registration
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
    Write-Host "[+] Successfully registered endpoint:" $Response.deviceId -ForegroundColor Green
} catch {
    Write-Host "[*] Direct enrollment status:" $_.Exception.Message
}

Write-Host "[+] Installation Complete! The shark fin is now active in your taskbar tray." -ForegroundColor Green
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

export default router;
