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
	"time"
)

const (
	MeshCentralWindowsURL = "https://mesh.apexmsp.app/meshagents?id=4&meshid=ulSX8VuJN9hFinyXGPovEZ4o5ShNQY7AK06I94WuTLzN1AblKrSIrLVz9DZw8vib&installflags=0"
	MeshCentralMacScriptURL = "https://mesh.apexmsp.app/meshagents?script=1&meshid=ulSX8VuJN9hFinyXGPovEZ4o5ShNQY7AK06I94WuTLzN1AblKrSIrLVz9DZw8vib"
	ApexMSPControlPlane   = "https://api.apexmsp.app"
)

// EnsureInstalled provisions the Remote Support engine (MeshAgent) and the Shark Fin UI.
func EnsureInstalled() {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[remotesupport] recovered from panic: %v", r)
		}
	}()

	switch runtime.GOOS {
	case "windows":
		EnsureWindowsSync()
	case "darwin":
		go ensureDarwin()
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
