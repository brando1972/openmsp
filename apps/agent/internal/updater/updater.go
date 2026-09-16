// Package updater applies an agent self-update directed by the control plane.
//
// Flow: the heartbeat response carries {version, url, sha256} when a newer build
// exists for this agent's os/arch. We download it, verify the SHA-256 (the
// checksum arrives over the authenticated heartbeat, so it is the trust anchor
// even though the download itself is a plain GET), swap it over the running
// executable, and re-exec so the new code takes over immediately.
//
//   - unix (macOS/Linux): rename the verified binary over the current
//     executable (atomic on the same filesystem) and syscall.Exec into it.
//   - windows: a running .exe can't be replaced in place, so we stage the new
//     binary next to it and leave a marker; the swap completes on next start
//     (see ApplyPendingWindows), which the service manager triggers on restart.
package updater

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"syscall"
	"time"
)

// Update is the control plane's update directive.
type Update struct {
	Version string
	URL     string
	SHA256  string
}

var inFlight sync.Mutex

// Apply downloads, verifies, and installs the update, then re-execs (unix) or
// stages it (windows). It returns an error on any failure; on success (unix) it
// does not return — the process image is replaced.
func Apply(u Update) error {
	if !inFlight.TryLock() {
		return fmt.Errorf("update already in progress")
	}
	defer inFlight.Unlock()

	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("resolve executable: %w", err)
	}
	exe, _ = filepath.EvalSymlinks(exe)

	// Download to a temp file next to the executable (same filesystem ⇒ atomic rename).
	dir := filepath.Dir(exe)
	tmp, err := os.CreateTemp(dir, ".apexagent-update-*")
	if err != nil {
		return fmt.Errorf("create temp: %w", err)
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath) // no-op if we renamed it away

	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Get(u.URL)
	if err != nil {
		tmp.Close()
		return fmt.Errorf("download: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		tmp.Close()
		return fmt.Errorf("download status %d", resp.StatusCode)
	}

	h := sha256.New()
	if _, err := io.Copy(io.MultiWriter(tmp, h), resp.Body); err != nil {
		tmp.Close()
		return fmt.Errorf("write update: %w", err)
	}
	tmp.Close()

	got := hex.EncodeToString(h.Sum(nil))
	if u.SHA256 != "" && !equalFold(got, u.SHA256) {
		return fmt.Errorf("checksum mismatch: got %s want %s", got, u.SHA256)
	}
	if err := os.Chmod(tmpPath, 0755); err != nil {
		return fmt.Errorf("chmod: %w", err)
	}

	if runtime.GOOS == "windows" {
		// Stage as <exe>.new; completed on next start.
		staged := exe + ".new"
		os.Remove(staged)
		if err := os.Rename(tmpPath, staged); err != nil {
			return fmt.Errorf("stage: %w", err)
		}
		return nil // caller exits; ApplyPendingWindows finishes the swap next boot
	}

	// unix: atomic swap over the running binary, then re-exec.
	if err := os.Rename(tmpPath, exe); err != nil {
		return fmt.Errorf("swap: %w", err)
	}
	// Replace the process image with the new binary.
	if err := syscall.Exec(exe, os.Args, os.Environ()); err != nil {
		return fmt.Errorf("re-exec: %w", err)
	}
	return nil // unreachable on success
}

// ApplyPendingWindows completes a staged Windows update at startup: if <exe>.new
// exists, swap it over the current executable. Call once early in main() on
// Windows before the agent settles into its loop.
func ApplyPendingWindows() {
	if runtime.GOOS != "windows" {
		return
	}
	exe, err := os.Executable()
	if err != nil {
		return
	}
	staged := exe + ".new"
	if _, err := os.Stat(staged); err != nil {
		return
	}
	old := exe + ".old"
	os.Remove(old)
	if err := os.Rename(exe, old); err != nil {
		return
	}
	if err := os.Rename(staged, exe); err != nil {
		_ = os.Rename(old, exe) // roll back
		return
	}
	os.Remove(old)
}

func equalFold(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := 0; i < len(a); i++ {
		ca, cb := a[i], b[i]
		if 'A' <= ca && ca <= 'Z' {
			ca += 'a' - 'A'
		}
		if 'A' <= cb && cb <= 'Z' {
			cb += 'a' - 'A'
		}
		if ca != cb {
			return false
		}
	}
	return true
}
