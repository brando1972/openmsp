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
	MeshCentralWindowsURL   = "https://mesh.apexmsp.app/meshagents?id=4&meshid=ulSX8VuJN9hFinyXGPovEZ4o5ShNQY7AK06I94WuTLzN1AblKrSIrLVz9DZw8vib&installflags=0"
	MeshCentralMacPkgURL    = "https://mesh.apexmsp.app/meshosxagent?id=29&meshid=ulSX8VuJN9hFinyXGPovEZ4o5ShNQY7AK06I94WuTLzN1AblKrSIrLVz9DZw8vib"
	MeshCentralMacScriptURL = "https://mesh.apexmsp.app/meshagents?script=1&meshid=ulSX8VuJN9hFinyXGPovEZ4o5ShNQY7AK06I94WuTLzN1AblKrSIrLVz9DZw8vib"
	ApexMSPControlPlane     = "https://api.apexmsp.app"
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
	// 1. Check if Mesh Agent is installed on macOS (/usr/local/mesh_services/meshagent/meshagent/meshagent)
	meshBin := "/usr/local/mesh_services/meshagent/meshagent/meshagent"
	if _, err := os.Stat(meshBin); err != nil {
		if _, altErr := os.Stat("/usr/local/mesh/meshagent"); altErr != nil {
			if os.Geteuid() == 0 {
				log.Printf("[remotesupport] Mesh Agent not found on macOS. Installing via universal .pkg...")
				pkgPath := "/tmp/ApexMSP-MeshAgent.pkg"
				if dlErr := downloadFile(MeshCentralMacPkgURL, pkgPath); dlErr == nil {
					if runErr := exec.Command("installer", "-pkg", pkgPath, "-target", "/").Run(); runErr != nil {
						log.Printf("[remotesupport] macOS Mesh .pkg install warning: %v", runErr)
					} else {
						log.Printf("[remotesupport] macOS Mesh Agent installed successfully.")
					}
					_ = os.Remove(pkgPath)
				} else {
					log.Printf("[remotesupport] macOS Mesh .pkg download warning: %v", dlErr)
				}
			}
		}
	} else if os.Geteuid() == 0 {
		// Ensure meshagent daemon is running
		if err := exec.Command("pgrep", "-x", "meshagent").Run(); err != nil {
			_ = exec.Command("launchctl", "kickstart", "-k", "system/meshagent").Run()
		}
	}

	// 2. Ensure Shark Fin Menubar app is installed and updated to v2.0.4
	appPath := "/Applications/ApexMSP.app"
	verMarker := "/Applications/ApexMSP.app/Contents/version.txt"
	const targetMenuVer = "2.0.4-soc"
	currentVerBytes, _ := os.ReadFile(verMarker)
	if _, err := os.Stat(appPath); err != nil || string(currentVerBytes) != targetMenuVer {
		log.Printf("[remotesupport] Installing/Updating Shark Fin Menubar app (%s)...", targetMenuVer)
		binDir := "/Applications/ApexMSP.app/Contents/MacOS"
		_ = os.MkdirAll(binDir, 0755)
		appBin := filepath.Join(binDir, "ApexMSP")
		if err := downloadFile(ApexMSPControlPlane+"/api/v1/installers/download?os=macos&component=menubar", appBin); err == nil {
			_ = os.Chmod(appBin, 0755)
			_ = os.WriteFile(verMarker, []byte(targetMenuVer), 0644)
			plist := `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>ApexMSP</string>
  <key>CFBundleExecutable</key><string>ApexMSP</string>
  <key>CFBundleShortVersionString</key><string>2.3.0</string>
  <key>LSUIElement</key><true/>
</dict></plist>`
			_ = os.WriteFile("/Applications/ApexMSP.app/Contents/Info.plist", []byte(plist), 0644)
			_ = exec.Command("codesign", "--force", "--deep", "-s", "-", "/Applications/ApexMSP.app").Run()

			// Also update ~/Applications/ApexMSP.app and ~/.apexmsp/ApexMSP.app for the active console user
			if out, err := exec.Command("stat", "-f", "%Su", "/dev/console").Output(); err == nil {
				consoleUser := string(out)
				if len(consoleUser) > 0 {
					for i := 0; i < len(consoleUser); i++ {
						if consoleUser[i] == '\n' || consoleUser[i] == '\r' {
							consoleUser = consoleUser[:i]
							break
						}
					}
					if consoleUser != "" && consoleUser != "root" {
						userHome := filepath.Join("/Users", consoleUser)
						for _, rel := range []string{"Applications/ApexMSP.app/Contents/MacOS/ApexMSP", ".apexmsp/ApexMSP.app/Contents/MacOS/ApexMSP"} {
							uBin := filepath.Join(userHome, rel)
							if _, stErr := os.Stat(filepath.Dir(uBin)); stErr == nil {
								if b, rErr := os.ReadFile(appBin); rErr == nil {
									_ = os.WriteFile(uBin, b, 0755)
								}
							}
						}
					}
				}
			}

			_ = exec.Command("killall", "ApexMSP").Run()
			time.Sleep(500 * time.Millisecond)
			_ = exec.Command("open", "-g", "-a", "/Applications/ApexMSP.app").Run()
			log.Printf("[remotesupport] Shark Fin Menubar app updated and launched (%s).", targetMenuVer)
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
