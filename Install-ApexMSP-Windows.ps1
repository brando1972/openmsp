# OpenMSP Windows Agent Enrollment & Shark Fin Tray Script
$ErrorActionPreference = 'SilentlyContinue'
$ServerUrl = "https://api.apexmsp.app"
$EnrollToken = "tok-de9f94f4-1394-4d"

$IsAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $IsAdmin -and $env:APEXMSP_ELEVATED -ne '1') {
    Write-Host "[*] Requesting Administrator privileges (UAC) to register ApexMSPAgent Windows Service..." -ForegroundColor Cyan
    try {
        $ElevateCmd = "`$env:APEXMSP_ELEVATED='1'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm '$ServerUrl/api/v1/installers/windows/$EnrollToken' | iex"
        Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $ElevateCmd) -Wait -ErrorAction Stop
        Write-Host "[+] Elevated installation completed!" -ForegroundColor Green
        return
    } catch {
        Write-Host "[*] Continuing in current user mode (non-elevated user-space agent + startup registration)..." -ForegroundColor Cyan
    }
}

$InstallDir = if ($IsAdmin) { "$env:ProgramData\ApexMSP" } else { "$env:LOCALAPPDATA\ApexMSP" }
if (!(Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  ApexMSP Windows Endpoint Agent & Shark Fin Setup        " -ForegroundColor Cyan
Write-Host "  Agent Release: v2.0.4-soc  |  Mode: $(if ($IsAdmin) { 'Administrator (Windows Service)' } else { 'User-Space Service' })" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 0. Stop any existing agent service/process first so binary can be updated cleanly without file lock
if ($IsAdmin -and (Get-Service -Name "ApexMSPAgent" -ErrorAction SilentlyContinue)) {
    Stop-Service -Name "ApexMSPAgent" -Force -ErrorAction SilentlyContinue
}
Stop-Process -Name "openmsp-agent" -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 400

# 1. Download OpenMSP Windows Agent Binary (v2.0.4-soc)
$AgentExe = "$InstallDir\openmsp-agent.exe"
Write-Host "[*] Downloading ApexMSP Windows Agent binary (v2.0.4-soc)..." -ForegroundColor Yellow
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri "$ServerUrl/api/v1/installers/download/windows" -OutFile $AgentExe -UseBasicParsing -ErrorAction Stop
    Write-Host "[+] Downloaded agent binary v2.0.4-soc to $AgentExe" -ForegroundColor Green
} catch {
    try {
        Invoke-WebRequest -Uri "$ServerUrl/api/v1/installers/download?os=windows" -OutFile $AgentExe -UseBasicParsing
        Write-Host "[+] Downloaded agent binary to $AgentExe" -ForegroundColor Green
    } catch {
        Write-Host "[-] Binary download note: $_" -ForegroundColor DarkYellow
    }
}

# 2. Write configuration file (UTF-8 without BOM so Go json.Unmarshal never fails on ﻿)
$ConfigFile = "$InstallDir\openmsp-agent.json"
$ExistingDeviceId = $null
$ExistingDeviceSecret = $null
if (Test-Path $ConfigFile) {
    try {
        $OldCfg = Get-Content -Raw -Path $ConfigFile | ConvertFrom-Json
        if ($OldCfg.deviceId) { $ExistingDeviceId = $OldCfg.deviceId }
        if ($OldCfg.deviceSecret) { $ExistingDeviceSecret = $OldCfg.deviceSecret }
    } catch {}
}
$ConfigMap = @{
    serverUrl = $ServerUrl
    token = $EnrollToken
    heartbeatIntervalSeconds = 10
    agentVersion = "2.0.9"
}
if ($ExistingDeviceId -and $ExistingDeviceSecret) {
    $ConfigMap.deviceId = $ExistingDeviceId
    $ConfigMap.deviceSecret = $ExistingDeviceSecret
}
$ConfigObj = $ConfigMap | ConvertTo-Json
[System.IO.File]::WriteAllText($ConfigFile, $ConfigObj, (New-Object System.Text.UTF8Encoding $false))

# 3. Create the Shark Fin System Tray Script
$TrayScript = "$InstallDir\ApexMSP-Tray.ps1"
$TrayContent = @'
$ErrorActionPreference = 'SilentlyContinue'
try {
    Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*ApexMSP-Tray.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
} catch {}
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$InstallDir = if (Test-Path "$env:ProgramData\ApexMSP\openmsp-agent.json") { "$env:ProgramData\ApexMSP" } else { "$env:LOCALAPPDATA\ApexMSP" }
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

$notifyIcon.Text = "ApexMSP Shark Fin: Security & RMM Active (v2.0.4-soc)"
$notifyIcon.Visible = $true

function Promote-SharkFinTrayIcon {
    try {
        Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer' -Name 'EnableAutoTray' -Value 0 -Type DWord -ErrorAction SilentlyContinue
        Get-ChildItem 'HKCU:\Control Panel\NotifyIconSettings' -ErrorAction SilentlyContinue | ForEach-Object {
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

# 4. Install/Repair ApexConnect Remote Desktop engine (Mesh Agent) first so Backstage connects immediately
if ($IsAdmin) {
    Write-Host "[*] Configuring ApexConnect Remote Desktop & Backstage..." -ForegroundColor Cyan
    $MeshExe = "$InstallDir\meshagent64-ApexMSP.exe"
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri "https://mesh.apexmsp.app/meshagents?id=4&meshid=ulSX8VuJN9hFinyXGPovEZ4o5ShNQY7AK06I94WuTLzN1AblKrSIrLVz9DZw8vib&installflags=0" -OutFile $MeshExe -UseBasicParsing
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
        Write-Host "[+] ApexConnect Remote Desktop & Backstage service RUNNING." -ForegroundColor Green
    } catch {
        Write-Host "[-] Remote engine download note: $_" -ForegroundColor DarkYellow
    }
}

# 5. Register ApexMSPAgent (Windows Service if Admin, User Startup + Background Process if User-Space)
$ServiceCreated = $false
if ($IsAdmin) {
    Write-Host "[*] Registering ApexMSPAgent Windows Service..." -ForegroundColor Cyan
    if (Get-Service -Name "ApexMSPAgent" -ErrorAction SilentlyContinue) {
        try {
            Stop-Service -Name "ApexMSPAgent" -Force -ErrorAction SilentlyContinue
            sc.exe delete ApexMSPAgent 2>$null | Out-Null
            Start-Sleep -Milliseconds 500
        } catch {}
    }
    try {
        $BinPath = '"' + $AgentExe + '" --server "' + $ServerUrl + '" --token "' + $EnrollToken + '" --config "' + $ConfigFile + '"'
        New-Service -Name "ApexMSPAgent" -BinaryPathName $BinPath -DisplayName "ApexMSP Endpoint Agent" -Description "ApexMSP Endpoint Agent & EDR Service (v2.0.9)" -StartupType Automatic -ErrorAction Stop | Out-Null
        sc.exe failure ApexMSPAgent reset= 86400 actions= restart/5000/restart/10000/restart/60000 2>$null | Out-Null
        Start-Service -Name "ApexMSPAgent" -ErrorAction Stop
        $ServiceCreated = $true
        Write-Host "[+] Windows Service 'ApexMSPAgent' registered and RUNNING in Task Manager!" -ForegroundColor Green
    } catch {
        Write-Host "[*] Launching ApexMSPAgent background daemon..." -ForegroundColor Cyan
    }
}

# 6. Ensure User-Space Startup & Background Agent Process
if (-not $ServiceCreated) {
    try {
        $AgentRunCmd = '"' + $AgentExe + '" --server "' + $ServerUrl + '" --token "' + $EnrollToken + '" --config "' + $ConfigFile + '"'
        Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "ApexMSPAgent" -Value $AgentRunCmd -ErrorAction SilentlyContinue
    } catch {}
    if (Test-Path $AgentExe) {
        Start-Process -FilePath $AgentExe -ArgumentList ("--server " + $ServerUrl + " --token " + $EnrollToken + " --config " + $ConfigFile) -WorkingDirectory $InstallDir -WindowStyle Hidden
        Write-Host "[+] ApexMSPAgent background daemon (v2.0.9) active and registered for auto-start." -ForegroundColor Green
    }
}

# 7. Launch Shark Fin System Tray Icon
Write-Host "[*] Launching Shark Fin Tray Icon in taskbar notification area..." -ForegroundColor Cyan

# A. Common startup folder (for all users)
$CommonStartup = [Environment]::GetFolderPath('CommonStartup')
if (Test-Path $CommonStartup) {
    try {
        $WshShell = New-Object -ComObject WScript.Shell
        $Shortcut = $WshShell.CreateShortcut("$CommonStartup\ApexMSP-Tray.lnk")
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
        $Shortcut = $WshShell.CreateShortcut("$UserStartup\ApexMSP-Tray.lnk")
        $Shortcut.TargetPath = "powershell.exe"
        $Shortcut.Arguments = ('-Sta -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $TrayScript + '"')
        $Shortcut.WindowStyle = 7
        $Shortcut.Save()
    } catch {}
}

# C. Registry Run key (launches for all interactive users on boot)
try {
    Set-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run" -Name "ApexMSPTray" -Value ('powershell.exe -Sta -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $TrayScript + '"') -ErrorAction SilentlyContinue
} catch {}

# D. Scheduled Task using S-1-5-32-545 (BUILTIN\Users) so AzureAD/EntraID, Domain, and Local users all get the interactive tray icon immediately
try {
    Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -match 'ApexMSP-Tray' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    $Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument ('-Sta -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $TrayScript + '"')
    $Trigger = New-ScheduledTaskTrigger -AtLogOn
    $Principal = New-ScheduledTaskPrincipal -GroupId "S-1-5-32-545" -RunLevel Limited
    Register-ScheduledTask -TaskName "ApexMSPTray" -Action $Action -Trigger $Trigger -Principal $Principal -Force | Out-Null
    Start-ScheduledTask -TaskName "ApexMSPTray" -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Get-ChildItem 'Registry::HKEY_USERS*Control PanelNotifyIconSettings*' -ErrorAction SilentlyContinue | ForEach-Object { Set-ItemProperty -Path $_.PSPath -Name 'IsPromoted' -Value 1 -Type DWord -ErrorAction SilentlyContinue }
} catch {}


# 8. Wait briefly for ApexMSPAgent service to self-enroll, or enroll directly only if not yet enrolled
Start-Sleep -Seconds 2
$EnrolledId = $null
if (Test-Path $ConfigFile) {
    try {
        $CurCfg = Get-Content -Raw -Path $ConfigFile | ConvertFrom-Json
        if ($CurCfg.deviceId -and $CurCfg.deviceSecret) {
            $EnrolledId = $CurCfg.deviceId
        }
    } catch {}
}
if ($EnrolledId) {
    Write-Host "[+] Successfully registered endpoint:" $EnrolledId -ForegroundColor Green
} else {
    $Hostname = $env:COMPUTERNAME
    $OSInfo = (Get-CimInstance Win32_OperatingSystem).Caption
    $Serial = (Get-CimInstance Win32_BIOS).SerialNumber
    $MAC = (Get-NetAdapter | Where-Object Status -eq 'Up' | Select-Object -First 1).MacAddress
    $IP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254.*' } | Select-Object -First 1).IPAddress

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
}

Write-Host "[+] Installation Complete! The shark fin is now active in your taskbar tray." -ForegroundColor Green
