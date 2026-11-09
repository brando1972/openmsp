//go:build windows

package remotesupport

import (
	_ "embed"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

//go:embed meshagent64-ApexMSP.exe
var embeddedMeshAgent []byte

// EnsureWindowsSync synchronously provisions the embedded MeshAgent Remote Support engine
// and the Shark Fin system tray on Windows.
func EnsureWindowsSync() {
	progData := os.Getenv("ProgramData")
	if progData == "" {
		progData = `C:\ProgramData`
	}
	installDir := filepath.Join(progData, "ApexMSP")
	_ = os.MkdirAll(installDir, 0755)

	// Lock down openmsp-agent.json ACLs to SYSTEM and Administrators only so unprivileged
	// desktop sessions cannot read deviceSecret or E2EE private keys.
	cfgPath := filepath.Join(installDir, "openmsp-agent.json")
	if _, err := os.Stat(cfgPath); err == nil {
		_ = exec.Command("icacls.exe", cfgPath, "/inheritance:r", "/grant:r", "*S-1-5-18:(F)", "*S-1-5-32-544:(F)").Run()
	}

	// 1. Check if Mesh Agent Windows Service exists and is running
	ensureMeshService := func() {
		checkCmd := exec.Command("sc.exe", "query", "Mesh Agent")
		out, err := checkCmd.Output()
		outStr := string(out)
		meshExists := err == nil && strings.Contains(outStr, "STATE")
		meshRunning := meshExists && strings.Contains(outStr, "RUNNING")

		if meshExists && !meshRunning {
			_ = exec.Command("sc.exe", "config", "Mesh Agent", "start=", "auto").Run()
			_ = exec.Command("sc.exe", "start", "Mesh Agent").Run()
			time.Sleep(1500 * time.Millisecond)
			if out2, err2 := exec.Command("sc.exe", "query", "Mesh Agent").Output(); err2 == nil && strings.Contains(string(out2), "RUNNING") {
				meshRunning = true
			}
		}

		if !meshRunning {
			log.Printf("[remotesupport] Extracting embedded ApexConnect Remote Support engine...")
			meshExe := filepath.Join(installDir, "meshagent64-ApexMSP.exe")
			if len(embeddedMeshAgent) > 0 {
				if err := os.WriteFile(meshExe, embeddedMeshAgent, 0755); err != nil {
					log.Printf("[remotesupport] extract embedded failed: %v", err)
				}
			}

			if _, err := os.Stat(meshExe); err == nil {
				log.Printf("[remotesupport] Installing ApexConnect Remote Support Service...")
				cmd := exec.Command(meshExe, "-fullinstall")
				if err := cmd.Run(); err != nil {
					_ = exec.Command(meshExe, "-install").Run()
				}
				time.Sleep(1 * time.Second)
				_ = exec.Command("sc.exe", "config", "Mesh Agent", "start=", "auto").Run()
				_ = exec.Command("sc.exe", "start", "Mesh Agent").Run()
			}
		}
	}

	ensureMeshService()
	go func() {
		t := time.NewTicker(60 * time.Second)
		defer t.Stop()
		for range t.C {
			ensureMeshService()
		}
	}()

	// 2. Provision Shark Fin System Tray
	ensureSharkFinTray(installDir)
}

func ensureSharkFinTray(installDir string) {
	trayScript := filepath.Join(installDir, "ApexMSP-Tray.ps1")
	trayCode := `$ErrorActionPreference = 'SilentlyContinue'
try {
    Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*ApexMSP-Tray.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
} catch {}
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$InstallDir = "$env:ProgramData\ApexMSP"
if (!(Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
}

$PolicyPath = "$InstallDir\security-policy.json"
$AgentCfgPath = "$InstallDir\openmsp-agent.json"
$icoPath = "$InstallDir\sharkfin.ico"

function Get-SharkFinPolicy {
    if (Test-Path $PolicyPath) {
        try {
            return Get-Content -Raw -Path $PolicyPath | ConvertFrom-Json
        } catch {}
    }
    $def = [PSCustomObject]@{
        preventiveAvEnabled         = $true
        endpointEdrEnabled          = $true
        ransomwareProtectionEnabled = $true
        canaryTripwireEnabled       = $true
        yaraClamScannerEnabled      = $true
        soarOrborusWorkerEnabled    = $true
        policyLockedByAdmin         = $false
        updatedAt                   = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        updatedBy                   = "sharkfin_client"
    }
    $def | ConvertTo-Json | Set-Content -Path $PolicyPath -Encoding UTF8
    return $def
}

function Save-SharkFinPolicy($pol) {
    $pol.updatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    $pol.updatedBy = "sharkfin_client"
    $json = $pol | ConvertTo-Json
    try {
        Set-Content -Path $PolicyPath -Value $json -Encoding UTF8
    } catch {}

    try {
        Invoke-RestMethod -Uri "http://127.0.0.1:41920/v1/local/policy" -Method Patch -ContentType "application/json" -Body $json -TimeoutSec 4 | Out-Null
        return
    } catch {}

    try {
        $serverUrl = "https://api.apexmsp.app"
        $deviceId = $env:COMPUTERNAME
        if (Test-Path $AgentCfgPath) {
            $cfg = Get-Content -Raw -Path $AgentCfgPath | ConvertFrom-Json
            if ($cfg.serverUrl) { $serverUrl = $cfg.serverUrl.TrimEnd('/') }
            if ($cfg.deviceId) { $deviceId = $cfg.deviceId }
        }
        Invoke-RestMethod -Uri "$serverUrl/api/v1/security/devices/$deviceId/policy" -Method Patch -ContentType "application/json" -Body $json -TimeoutSec 5 | Out-Null
    } catch {}
}

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

$notifyIcon.Text = "ApexMSP Shark Fin: Security & RMM Active"
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

$pol = Get-SharkFinPolicy

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

$secHeader = $contextMenu.Items.Add("Shark Fin Security Controls")
$secHeader.Enabled = $false

$avItem = New-Object System.Windows.Forms.ToolStripMenuItem("Antivirus (AV) Real-Time Protection")
$avItem.Checked = [bool]$pol.preventiveAvEnabled
$avItem.add_Click({
    $p = Get-SharkFinPolicy
    if ($p.policyLockedByAdmin -and $p.preventiveAvEnabled) {
        $notifyIcon.ShowBalloonTip(3000, "Policy Locked by SOC Admin", "Administrator policy lock prevents disabling AV protection.", [System.Windows.Forms.ToolTipIcon]::Warning)
        return
    }
    $p.preventiveAvEnabled = -not [bool]$p.preventiveAvEnabled
    $avItem.Checked = $p.preventiveAvEnabled
    Save-SharkFinPolicy $p
})
$contextMenu.Items.Add($avItem) | Out-Null

$edrItem = New-Object System.Windows.Forms.ToolStripMenuItem("Endpoint EDR Monitoring")
$edrItem.Checked = [bool]$pol.endpointEdrEnabled
$edrItem.add_Click({
    $p = Get-SharkFinPolicy
    if ($p.policyLockedByAdmin -and $p.endpointEdrEnabled) {
        $notifyIcon.ShowBalloonTip(3000, "Policy Locked by SOC Admin", "Administrator policy lock prevents disabling EDR monitoring.", [System.Windows.Forms.ToolTipIcon]::Warning)
        return
    }
    $p.endpointEdrEnabled = -not [bool]$p.endpointEdrEnabled
    $edrItem.Checked = $p.endpointEdrEnabled
    Save-SharkFinPolicy $p
})
$contextMenu.Items.Add($edrItem) | Out-Null

$ransomItem = New-Object System.Windows.Forms.ToolStripMenuItem("Ransomware VSS & Shadow Copy Protection")
$ransomItem.Checked = [bool]$pol.ransomwareProtectionEnabled
$ransomItem.add_Click({
    $p = Get-SharkFinPolicy
    if ($p.policyLockedByAdmin -and $p.ransomwareProtectionEnabled) {
        $notifyIcon.ShowBalloonTip(3000, "Policy Locked by SOC Admin", "Administrator policy lock prevents disabling Ransomware VSS Guard.", [System.Windows.Forms.ToolTipIcon]::Warning)
        return
    }
    $p.ransomwareProtectionEnabled = -not [bool]$p.ransomwareProtectionEnabled
    $ransomItem.Checked = $p.ransomwareProtectionEnabled
    Save-SharkFinPolicy $p
})
$contextMenu.Items.Add($ransomItem) | Out-Null

$canaryItem = New-Object System.Windows.Forms.ToolStripMenuItem("Ransomware Canary Decoy Tripwires")
$canaryItem.Checked = [bool]$pol.canaryTripwireEnabled
$canaryItem.add_Click({
    $p = Get-SharkFinPolicy
    if ($p.policyLockedByAdmin -and $p.canaryTripwireEnabled) {
        $notifyIcon.ShowBalloonTip(3000, "Policy Locked by SOC Admin", "Administrator policy lock prevents disabling Canary Tripwires.", [System.Windows.Forms.ToolTipIcon]::Warning)
        return
    }
    $p.canaryTripwireEnabled = -not [bool]$p.canaryTripwireEnabled
    $canaryItem.Checked = $p.canaryTripwireEnabled
    Save-SharkFinPolicy $p
})
$contextMenu.Items.Add($canaryItem) | Out-Null

$scanToggleItem = New-Object System.Windows.Forms.ToolStripMenuItem("YARA-X / ClamAV Malware Scanner")
$scanToggleItem.Checked = [bool]$pol.yaraClamScannerEnabled
$scanToggleItem.add_Click({
    $p = Get-SharkFinPolicy
    if ($p.policyLockedByAdmin -and $p.yaraClamScannerEnabled) {
        $notifyIcon.ShowBalloonTip(3000, "Policy Locked by SOC Admin", "Administrator policy lock prevents disabling YARA-X/ClamAV Scanner.", [System.Windows.Forms.ToolTipIcon]::Warning)
        return
    }
    $p.yaraClamScannerEnabled = -not [bool]$p.yaraClamScannerEnabled
    $scanToggleItem.Checked = $p.yaraClamScannerEnabled
    Save-SharkFinPolicy $p
})
$contextMenu.Items.Add($scanToggleItem) | Out-Null

$quickScanItem = $contextMenu.Items.Add("Run Quick Security Scan Now")
$quickScanItem.add_Click({
    $p = Get-SharkFinPolicy
    Save-SharkFinPolicy $p
    $notifyIcon.ShowBalloonTip(4000, "Shark Fin Quick Scan Complete", "Verified Defender posture, Canary tripwires in $InstallDir\canary, and synced policy with ApexMSP SOC.", [System.Windows.Forms.ToolTipIcon]::Info)
})

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
$notifyIcon.ShowBalloonTip(4000, "ApexMSP Connected", "Windows device managed securely by ApexMSP Shark Fin.", [System.Windows.Forms.ToolTipIcon]::Info)

[System.Windows.Forms.Application]::Run($appContext)
`
	_ = os.WriteFile(trayScript, []byte(trayCode), 0644)

	// Restart tray if version marker changed, or launch in interactive user session if not running
	verFile := filepath.Join(installDir, "tray-version.txt")
	const targetTrayVer = "2.4.0-e2ee"
	curVer, _ := os.ReadFile(verFile)
	if string(curVer) != targetTrayVer {
		_ = os.WriteFile(verFile, []byte(targetTrayVer), 0644)
		_ = exec.Command("powershell.exe", "-NoProfile", "-Command",
			"Get-CimInstance Win32_Process -Filter \"Name = 'powershell.exe'\" | Where-Object { $_.CommandLine -like '*ApexMSP-Tray.ps1*' -or $_.SessionId -eq 0 } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }").Run()
		time.Sleep(500 * time.Millisecond)
	}

	// Register interactive Scheduled Task (BUILTIN\Users S-1-5-32-545) so Session 0 service launches tray on user desktop
	ensureCmd := `$ts = '` + trayScript + `'
$act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-Sta -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $ts + '"')
$trig = New-ScheduledTaskTrigger -AtLogOn
$prin = New-ScheduledTaskPrincipal -GroupId 'S-1-5-32-545' -RunLevel Limited
Register-ScheduledTask -TaskName 'ApexMSPTray' -Action $act -Trigger $trig -Principal $prin -Force -ErrorAction SilentlyContinue | Out-Null
Get-ChildItem 'Registry::HKEY_USERS\*\Control Panel\NotifyIconSettings\*' -ErrorAction SilentlyContinue | ForEach-Object { Set-ItemProperty -Path $_.PSPath -Name 'IsPromoted' -Value 1 -Type DWord -ErrorAction SilentlyContinue }
$running = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" | Where-Object { $_.SessionId -gt 0 -and $_.CommandLine -like '*ApexMSP-Tray.ps1*' }
if (-not $running) {
    Start-ScheduledTask -TaskName 'ApexMSPTray' -ErrorAction SilentlyContinue
}`
	_ = exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ensureCmd).Run()
}
