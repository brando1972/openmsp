// Package updater lets the agent update itself: it asks the control plane for
// the latest version + signed download, and if newer, downloads, verifies the
// SHA-256, swaps the binary, and restarts (via the launchd/service watchdog).
package updater

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type updateInfo struct {
	Version string `json:"version"`
	URL     string `json:"url"`    // absolute or path relative to server
	Sha256  string `json:"sha256"` // hex, optional but recommended
}

// CheckAndApply checks for a newer agent and, if found (or force), applies it.
// Returns whether an update was applied and the new version. On unix the running
// binary is replaced in place and the process exits so the watchdog relaunches
// the new version; on Windows the new binary is staged and swapped on restart.
func CheckAndApply(ctx context.Context, serverURL, currentVersion string, force bool) (bool, string, error) {
	serverURL = strings.TrimRight(serverURL, "/")
	info, err := fetchInfo(ctx, serverURL)
	if err != nil {
		return false, "", err
	}
	if info.Version == "" {
		return false, "", nil
	}
	if !force && !semverLess(currentVersion, info.Version) {
		return false, "", nil // already current or newer
	}

	url := info.URL
	if strings.HasPrefix(url, "/") {
		url = serverURL + url
	}
	data, err := download(ctx, url)
	if err != nil {
		return false, "", fmt.Errorf("download update: %w", err)
	}
	if info.Sha256 != "" {
		sum := sha256.Sum256(data)
		if !strings.EqualFold(hex.EncodeToString(sum[:]), info.Sha256) {
			return false, "", fmt.Errorf("update checksum mismatch")
		}
	}

	exe, err := os.Executable()
	if err != nil {
		return false, "", err
	}
	exe, _ = filepath.EvalSymlinks(exe)

	if err := swap(exe, data); err != nil {
		return false, "", err
	}
	return true, info.Version, nil
}

func fetchInfo(ctx context.Context, serverURL string) (*updateInfo, error) {
	osName := runtime.GOOS
	if osName == "darwin" {
		osName = "macos"
	}
	u := fmt.Sprintf("%s/api/v1/installers/update?os=%s&arch=%s", serverURL, osName, runtime.GOARCH)
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	c := &http.Client{Timeout: 20 * time.Second}
	resp, err := c.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("update info status %d", resp.StatusCode)
	}
	var info updateInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return nil, err
	}
	return &info, nil
}

func download(ctx context.Context, url string) ([]byte, error) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	c := &http.Client{Timeout: 5 * time.Minute}
	resp, err := c.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download status %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// swap replaces the binary at exe with data.
func swap(exe string, data []byte) error {
	dir := filepath.Dir(exe)
	newPath := exe + ".new"
	if err := os.WriteFile(newPath, data, 0o755); err != nil {
		return err
	}

	if runtime.GOOS == "windows" {
		// Can't overwrite a running .exe on Windows. Stage .new and let a
		// detached helper swap it once this process exits, then restart the task.
		return stageWindowsSwap(exe, newPath)
	}

	// Unix: renaming over a running binary is allowed; the running process keeps
	// the old inode, the next start uses the new file.
	if err := os.Rename(newPath, exe); err != nil {
		return err
	}
	_ = dir
	// Exit so the watchdog (launchd KeepAlive / systemd / Windows task) relaunches
	// the freshly written binary.
	go func() { time.Sleep(500 * time.Millisecond); os.Exit(0) }()
	return nil
}

// stageWindowsSwap writes a helper that waits for this PID to exit, replaces the
// exe, and restarts the scheduled task. Best-effort; validate on a live box.
func stageWindowsSwap(exe, newPath string) error {
	pid := os.Getpid()
	bat := filepath.Join(filepath.Dir(exe), "openmsp-update.cmd")
	script := fmt.Sprintf(`@echo off
:waitloop
tasklist /FI "PID eq %d" | find "%d" >nul
if not errorlevel 1 (
  timeout /t 1 /nobreak >nul
  goto waitloop
)
move /Y "%s" "%s" >nul
schtasks /Run /TN "OpenMSP Agent" >nul 2>&1
del "%%~f0"
`, pid, pid, newPath, exe)
	if err := os.WriteFile(bat, []byte(script), 0o755); err != nil {
		return err
	}
	cmd := exec.Command("cmd.exe", "/C", "start", "/b", "", bat)
	if err := cmd.Start(); err != nil {
		return err
	}
	go func() { time.Sleep(500 * time.Millisecond); os.Exit(0) }()
	return nil
}

// semverLess reports whether a < b for dotted versions like 0.2.0 / 1.10.3.
// Pre-release suffixes (e.g. -dev) are ignored for the comparison.
func semverLess(a, b string) bool {
	pa := parseVer(a)
	pb := parseVer(b)
	for i := 0; i < 3; i++ {
		if pa[i] != pb[i] {
			return pa[i] < pb[i]
		}
	}
	return false
}

func parseVer(v string) [3]int {
	v = strings.TrimPrefix(strings.TrimSpace(v), "v")
	if i := strings.IndexAny(v, "-+"); i >= 0 {
		v = v[:i]
	}
	var out [3]int
	for i, part := range strings.SplitN(v, ".", 3) {
		if i > 2 {
			break
		}
		n, _ := strconv.Atoi(part)
		out[i] = n
	}
	return out
}
