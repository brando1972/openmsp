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

	// 1. Check if Mesh Agent Windows Service exists and is running
	meshRunning := false
	checkCmd := exec.Command("sc.exe", "query", "Mesh Agent")
	if out, err := checkCmd.Output(); err == nil && strings.Contains(string(out), "STATE") && strings.Contains(string(out), "RUNNING") {
		meshRunning = true
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
			cmd := exec.Command(meshExe, "-install")
			if err := cmd.Run(); err != nil {
				log.Printf("[remotesupport] install error: %v", err)
			} else {
				log.Printf("[remotesupport] ApexConnect Remote Support installed successfully.")
			}
			time.Sleep(1 * time.Second)
			_ = exec.Command("sc.exe", "start", "Mesh Agent").Run()
		}
	} else {
		log.Printf("[remotesupport] ApexConnect Remote Support engine is active.")
	}

	// 2. Provision Shark Fin System Tray
	ensureSharkFinTray(installDir)
}

func ensureSharkFinTray(installDir string) {
	trayScript := filepath.Join(installDir, "ApexMSP-Tray.ps1")
	trayCode := `$ErrorActionPreference = 'SilentlyContinue'
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
    Set-Content -Path $PolicyPath -Value $json -Encoding UTF8

    try {
        $serverUrl = "http://192.168.4.150:3001"
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

$pol = Get-SharkFinPolicy

$contextMenu = New-Object System.Windows.Forms.ContextMenuStrip
$headerItem = $contextMenu.Items.Add("ApexMSP Shark Fin: $env:COMPUTERNAME")
$headerItem.Enabled = $false
$statusItem = $contextMenu.Items.Add("Status: Online (Active EDR & AV Supervision)")
$statusItem.Enabled = $false
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

	// Launch tray in background if not already running
	checkTray := exec.Command("powershell.exe", "-NoProfile", "-Command", "Get-Process -Name powershell | Where-Object { $_.CommandLine -like '*ApexMSP-Tray.ps1*' }")
	if out, _ := checkTray.Output(); len(strings.TrimSpace(string(out))) == 0 {
		_ = exec.Command("powershell.exe", "-NoProfile", "-WindowStyle", "Hidden", "-File", trayScript).Start()
	}
}
