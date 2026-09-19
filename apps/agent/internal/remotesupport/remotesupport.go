package remotesupport

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const (
	MeshCentralWindowsURL = "https://mesh.apexmsp.app/meshagents?id=4&meshid=ulSX8VuJN9hFinyXGPovEZ4o5ShNQY7AK06I94WuTLzN1AblKrSIrLVz9DZw8vib&installflags=0"
	MeshCentralMacScriptURL = "https://mesh.apexmsp.app/meshagents?script=1&meshid=ulSX8VuJN9hFinyXGPovEZ4o5ShNQY7AK06I94WuTLzN1AblKrSIrLVz9DZw8vib"
	ApexMSPControlPlane   = "https://api.apexmsp.app"
)

// EnsureInstalled starts a background goroutine to provision the Remote Support engine
// (MeshAgent) and the Shark Fin UI for the current platform if not already running.
func EnsureInstalled() {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("[remotesupport] recovered from panic: %v", r)
			}
		}()

		switch runtime.GOOS {
		case "windows":
			ensureWindows()
		case "darwin":
			ensureDarwin()
		}
	}()
}

func ensureWindows() {
	progData := os.Getenv("ProgramData")
	if progData == "" {
		progData = `C:\ProgramData`
	}
	installDir := filepath.Join(progData, "ApexMSP")
	_ = os.MkdirAll(installDir, 0755)

	// 1. Check if Mesh Agent Windows Service exists
	meshInstalled := false
	checkCmd := exec.Command("sc.exe", "query", "Mesh Agent")
	if out, err := checkCmd.Output(); err == nil && strings.Contains(string(out), "STATE") {
		meshInstalled = true
	}
	if _, err := os.Stat(`C:\Program Files\Mesh Agent\MeshAgent.exe`); err == nil {
		meshInstalled = true
	}

	if !meshInstalled {
		log.Printf("[remotesupport] Mesh Agent not detected. Downloading ApexConnect Remote Support engine...")
		meshExe := filepath.Join(installDir, "meshagent64-ApexMSP.exe")
		if err := downloadFile(MeshCentralWindowsURL, meshExe); err != nil {
			log.Printf("[remotesupport] download failed: %v", err)
		} else {
			cmd := exec.Command(meshExe, "-install")
			if err := cmd.Run(); err != nil {
				log.Printf("[remotesupport] install failed: %v", err)
			} else {
				log.Printf("[remotesupport] ApexConnect Remote Support engine installed successfully.")
				_ = exec.Command("sc.exe", "start", "Mesh Agent").Run()
			}
		}
	} else {
		log.Printf("[remotesupport] ApexConnect Remote Support engine is active.")
	}

	// 2. Provision Shark Fin System Tray
	trayScript := filepath.Join(installDir, "ApexMSP-Tray.ps1")
	if _, err := os.Stat(trayScript); err != nil {
		trayCode := `$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$bmp = New-Object System.Drawing.Bitmap(32, 32)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 14, 165, 233), 2.5)
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(210, 14, 165, 233))
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.StartFigure()
$path.AddBezier(5, 22, 8, 14, 15, 6, 22, 5)
$path.AddBezier(22, 5, 24, 13, 25, 18, 26, 22)
$path.CloseFigure()
$g.FillPath($brush, $path)
$g.DrawPath($pen, $path)

$hIcon = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)

$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
$notifyIcon.Icon = $icon
$notifyIcon.Text = "ApexMSP Endpoint: Protected & Online"
$notifyIcon.Visible = $true

$contextMenu = New-Object System.Windows.Forms.ContextMenuStrip
$headerItem = $contextMenu.Items.Add("ApexMSP Endpoint: $env:COMPUTERNAME")
$headerItem.Enabled = $false
$contextMenu.Items.Add("-") | Out-Null
$portalItem = $contextMenu.Items.Add("Open ApexMSP Console")
$portalItem.add_Click({ [System.Diagnostics.Process]::Start("https://apexmsp.app") })
$contextMenu.Items.Add("-") | Out-Null
$exitItem = $contextMenu.Items.Add("Hide Tray Icon")
$exitItem.add_Click({ $notifyIcon.Visible = $false; [System.Windows.Forms.Application]::Exit() })

$notifyIcon.ContextMenuStrip = $contextMenu
$notifyIcon.ShowBalloonTip(4000, "ApexMSP Protected", "Windows endpoint connected to ApexMSP Control Plane.", [System.Windows.Forms.ToolTipIcon]::Info)
[System.Windows.Forms.Application]::Run()
`
		_ = os.WriteFile(trayScript, []byte(trayCode), 0644)
	}

	// Launch tray in background if not already running
	checkTray := exec.Command("powershell.exe", "-NoProfile", "-Command", "Get-Process -Name powershell | Where-Object { $_.CommandLine -like '*ApexMSP-Tray.ps1*' }")
	if out, _ := checkTray.Output(); len(strings.TrimSpace(string(out))) == 0 {
		_ = exec.Command("powershell.exe", "-NoProfile", "-WindowStyle", "Hidden", "-File", trayScript).Start()
	}
}

func ensureDarwin() {
	// 1. Check if Mesh Agent is installed on macOS
	if _, err := os.Stat("/usr/local/mesh/meshagent"); err != nil {
		log.Printf("[remotesupport] Mesh Agent not found on macOS. Installing via bootstrap script...")
		cmd := exec.Command("sh", "-c", fmt.Sprintf(`curl -fsSL "%s" | bash 2>/dev/null`, MeshCentralMacScriptURL))
		if err := cmd.Run(); err != nil {
			log.Printf("[remotesupport] macOS Mesh bootstrap warning: %v", err)
		} else {
			log.Printf("[remotesupport] macOS Mesh Agent installed successfully.")
		}
	} else {
		log.Printf("[remotesupport] macOS Mesh Agent already installed.")
	}

	// 2. Check if Shark Fin Menubar app is installed
	appPath := "/Applications/ApexMSP.app"
	if _, err := os.Stat(appPath); err != nil {
		log.Printf("[remotesupport] Downloading Shark Fin Menubar app...")
		binDir := "/Applications/ApexMSP.app/Contents/MacOS"
		_ = os.MkdirAll(binDir, 0755)
		appBin := filepath.Join(binDir, "ApexMSP")
		if err := downloadFile(ApexMSPControlPlane+"/api/v1/installers/download?os=macos&component=menubar", appBin); err == nil {
			_ = os.Chmod(appBin, 0755)
			plist := `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>ApexMSP</string>
  <key>CFBundleExecutable</key><string>ApexMSP</string>
  <key>LSUIElement</key><true/>
</dict></plist>`
			_ = os.WriteFile("/Applications/ApexMSP.app/Contents/Info.plist", []byte(plist), 0644)
			_ = exec.Command("codesign", "--force", "--deep", "-s", "-", "/Applications/ApexMSP.app").Run()
			_ = exec.Command("open", "-g", "-a", "/Applications/ApexMSP.app").Run()
			log.Printf("[remotesupport] Shark Fin Menubar app installed and launched.")
		}
	}
}

func downloadFile(url, dest string) error {
	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("bad HTTP status: %s", resp.Status)
	}

	out, err := os.OpenFile(dest, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, resp.Body)
	return err
}
