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

function renderScript(os: string, token: string | undefined, req: any, res: any) {
  const proto = req.get('x-forwarded-proto') || req.protocol;
  const serverUrl = `${proto}://${req.get('host')}`;
  const relayHost = store.rustDeskConfig.relayServer.split(':')[0] || 'relay.openmsp.local';

  if (os === 'macos') {
    const script = `#!/bin/bash
set -e
echo "[+] OpenMSP macOS Agent & Shark Fin Setup..."
SERVER_URL="${serverUrl}"
ENROLL_TOKEN="${token || 'apex-brandon-ray'}"
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
  curl -fsSL "https://mesh.apexmsp.app/meshagents?script=1&meshid=ulSX8VuJN9hFinyXGPovEZ4o5ShNQY7AK06I94WuTLzN1AblKrSIrLVz9DZw8vib" | bash 2>/dev/null || true

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

  // Windows PowerShell script
  const script = `# OpenMSP Windows Agent Enrollment & Shark Fin Tray Script
$ErrorActionPreference = 'SilentlyContinue'
$ServerUrl = "${serverUrl}"
$EnrollToken = "${token || 'apex-brandon-ray'}"
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

$InstallDir = "$env:ProgramData\ApexMSP"
if (!(Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
}

$icoPath = "$InstallDir\sharkfin.ico"

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

$notifyIcon.Text = "ApexMSP Endpoint: Managing & Online"
$notifyIcon.Visible = $true

$contextMenu = New-Object System.Windows.Forms.ContextMenuStrip
$headerItem = $contextMenu.Items.Add("ApexMSP Endpoint: $env:COMPUTERNAME")
$headerItem.Enabled = $false
$statusItem = $contextMenu.Items.Add("Status: Online (Active Management)")
$statusItem.Enabled = $false
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
  const os = (req.query.os as string) || 'macos';
  const token = req.query.token as string | undefined;
  renderScript(os, token, req, res);
});

// GET /api/v1/installers/quick/:ext (ps1, sh)
router.get(['/quick/:ext', '/quick'], (req, res) => {
  const ext = String(req.params.ext || '').toLowerCase();
  const os = (ext === 'ps1' || ext === 'bat' || ext === 'cmd' || ext === 'windows') ? 'windows' : 'macos';
  const token = req.query.token as string | undefined;
  renderScript(os, token, req, res);
});

export default router;
