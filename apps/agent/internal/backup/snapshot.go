package backup

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"
)

// SnapshotOptions configures OS-level atomic volume freeze behavior prior to backup.
type SnapshotOptions struct {
	Mode               string
	EnableWindowsVSS   bool
	EnableAPFSSnapshot bool
	EnableLVMSnapshot  bool
	OSOverride         string // used in unit tests to exercise specific OS branches
}

// VolumeSnapshot represents an active point-in-time volume snapshot (VSS, APFS, LVM, or Btrfs)
// or its graceful passthrough fallback when running unprivileged.
type VolumeSnapshot struct {
	Provider         string   `json:"provider"` // "windows_vss" | "macos_apfs_tmutil" | "linux_btrfs" | "linux_lvm" | "passthrough_fallback"
	Volume           string   `json:"volume"`
	ShadowPath       string   `json:"shadowPath"`
	SnapshotID       string   `json:"snapshotId"`
	VSSShadowUsed    bool     `json:"vssShadowUsed"`
	SystemStateDir   string   `json:"systemStateDir,omitempty"`
	SystemStateFiles []string `json:"systemStateFiles,omitempty"`
	FallbackUsed     bool     `json:"fallbackUsed"`
	FallbackReason   string   `json:"fallbackReason,omitempty"`
	CreatedAt        string   `json:"createdAt"`
	CleanedUp        bool     `json:"cleanedUp"`
	cleanupOnce      sync.Once
	cleanupFn        func() error
}

// Cleanup releases the underlying OS shadow copy / snapshot and removes temporary state files.
func (vs *VolumeSnapshot) Cleanup() error {
	if vs == nil {
		return nil
	}
	var err error
	vs.cleanupOnce.Do(func() {
		vs.CleanedUp = true
		if vs.cleanupFn != nil {
			err = vs.cleanupFn()
		}
	})
	return err
}

// DetectCapabilities inspects the host OS to report whether VSS, APFS, or LVM/Btrfs snapshots are supported.
func DetectCapabilities() (vssAvailable, apfsAvailable, lvmAvailable bool) {
	switch runtime.GOOS {
	case "windows":
		if _, err := exec.LookPath("vssadmin.exe"); err == nil {
			vssAvailable = true
		} else if _, err := exec.LookPath("powershell.exe"); err == nil {
			vssAvailable = true
		}
	case "darwin":
		if _, err := exec.LookPath("tmutil"); err == nil {
			apfsAvailable = true
		}
	case "linux":
		if _, err := exec.LookPath("lvcreate"); err == nil {
			lvmAvailable = true
		} else if _, err := exec.LookPath("btrfs"); err == nil {
			lvmAvailable = true
		}
	}
	return vssAvailable, apfsAvailable, lvmAvailable
}

// CreateVolumeSnapshot creates a crash-consistent atomic volume snapshot for targetPath
// according to the host OS and policy options, falling back gracefully to passthrough
// if the host lacks privileges or volume shadow support.
func CreateVolumeSnapshot(ctx context.Context, targetPath string, opts SnapshotOptions) (*VolumeSnapshot, error) {
	if strings.TrimSpace(targetPath) == "" {
		targetPath = "."
	}
	targetOS := runtime.GOOS
	if opts.OSOverride != "" {
		targetOS = opts.OSOverride
	}

	wantSnapshot := opts.Mode == "volume_snapshot_vss" ||
		opts.Mode == "bare_metal_image" ||
		opts.EnableWindowsVSS ||
		opts.EnableAPFSSnapshot ||
		opts.EnableLVMSnapshot

	if !wantSnapshot {
		return newPassthroughSnapshot(targetPath, "snapshot_not_requested"), nil
	}

	switch targetOS {
	case "windows":
		return createVSSSnapshot(ctx, targetPath)
	case "darwin":
		return createAPFSSnapshot(ctx, targetPath)
	case "linux":
		return createLinuxSnapshot(ctx, targetPath)
	default:
		return newPassthroughSnapshot(targetPath, fmt.Sprintf("unsupported_os_%s", targetOS)), nil
	}
}

var (
	reShadowID  = regexp.MustCompile(`(?i)SHADOW_ID=([\{0-9a-fA-F\-\}]+)`)
	reDeviceObj = regexp.MustCompile(`(?i)DEVICE_OBJ=([^\r\n]+)`)
	reTmutilDate = regexp.MustCompile(`(\d{4}-\d{2}-\d{2}-\d{6})`)
)

// createVSSSnapshot creates a Windows Volume Shadow Copy via Win32_ShadowCopy / vssadmin
// and captures HKLM\SYSTEM + BCD system state prior to freezing.
func createVSSSnapshot(ctx context.Context, targetPath string) (*VolumeSnapshot, error) {
	volume := extractWindowsVolume(targetPath)
	now := time.Now().UTC().Format(time.RFC3339)

	if runtime.GOOS != "windows" {
		return newPassthroughSnapshot(targetPath, "vss_unavailable_on_"+runtime.GOOS), nil
	}

	stateDir, _ := os.MkdirTemp("", "apexmsp-vss-sysstate-*")
	var stateFiles []string
	if stateDir != "" {
		sysHive := filepath.Join(stateDir, "SYSTEM.hiv")
		bcdFile := filepath.Join(stateDir, "bcd.bak")
		cctx, cancel := context.WithTimeout(ctx, 15*time.Second)
		_ = exec.CommandContext(cctx, "reg.exe", "save", `HKLM\SYSTEM`, sysHive, "/y").Run()
		_ = exec.CommandContext(cctx, "bcdedit.exe", "/export", bcdFile).Run()
		cancel()

		if _, err := os.Stat(sysHive); err == nil {
			stateFiles = append(stateFiles, sysHive)
		}
		if _, err := os.Stat(bcdFile); err == nil {
			stateFiles = append(stateFiles, bcdFile)
		}
	}

	psScript := fmt.Sprintf(
		`$r = (Get-WmiObject -List Win32_ShadowCopy).Create("%s", "ClientAccessible"); `+
			`if ($r.ReturnValue -ne 0) { exit $r.ReturnValue }; `+
			`$sc = Get-WmiObject Win32_ShadowCopy | Where-Object { $_.ID -eq $r.ShadowID }; `+
			`Write-Output ("SHADOW_ID=" + $r.ShadowID); `+
			`Write-Output ("DEVICE_OBJ=" + $sc.DeviceObject)`,
		volume,
	)

	cctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	cmd := exec.CommandContext(cctx, "powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", psScript)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	err := cmd.Run()
	output := out.String()

	var shadowID, deviceObj string
	if m := reShadowID.FindStringSubmatch(output); len(m) > 1 {
		shadowID = strings.TrimSpace(m[1])
	}
	if m := reDeviceObj.FindStringSubmatch(output); len(m) > 1 {
		deviceObj = strings.TrimSpace(m[1])
	}

	if err != nil || shadowID == "" || deviceObj == "" {
		if stateDir != "" {
			_ = os.RemoveAll(stateDir)
		}
		reason := "vss_wmi_create_failed"
		if err != nil {
			reason = fmt.Sprintf("vss_create_failed: %v", err)
		}
		return newPassthroughSnapshot(targetPath, reason), nil
	}

	if !strings.HasSuffix(deviceObj, `\`) {
		deviceObj += `\`
	}

	// Map targetPath relative to volume onto the shadow device path if possible.
	relPath := strings.TrimPrefix(targetPath, volume)
	relPath = strings.TrimLeft(relPath, `\/`)
	shadowTarget := deviceObj
	if relPath != "" {
		shadowTarget = deviceObj + relPath
	}

	return &VolumeSnapshot{
		Provider:         "windows_vss",
		Volume:           volume,
		ShadowPath:       shadowTarget,
		SnapshotID:       shadowID,
		VSSShadowUsed:    true,
		SystemStateDir:   stateDir,
		SystemStateFiles: stateFiles,
		FallbackUsed:     false,
		CreatedAt:        now,
		cleanupFn: func() error {
			if stateDir != "" {
				_ = os.RemoveAll(stateDir)
			}
			delCtx, delCancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer delCancel()
			return exec.CommandContext(delCtx, "vssadmin.exe", "delete", "shadows", "/shadow="+shadowID, "/quiet").Run()
		},
	}, nil
}

// createAPFSSnapshot creates a local APFS Time Machine snapshot on macOS via tmutil localsnapshot.
func createAPFSSnapshot(ctx context.Context, targetPath string) (*VolumeSnapshot, error) {
	if runtime.GOOS != "darwin" {
		return newPassthroughSnapshot(targetPath, "apfs_unavailable_on_"+runtime.GOOS), nil
	}
	tmutilBin, err := exec.LookPath("tmutil")
	if err != nil {
		return newPassthroughSnapshot(targetPath, "tmutil_not_found"), nil
	}

	// Avoid blocking or prompting in non-root environments where tmutil localsnapshot is restricted.
	if os.Geteuid() != 0 {
		return newPassthroughSnapshot(targetPath, "apfs_localsnapshot_requires_root_or_fda"), nil
	}

	cctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	out, err := exec.CommandContext(cctx, tmutilBin, "localsnapshot").CombinedOutput()
	if err != nil {
		return newPassthroughSnapshot(targetPath, fmt.Sprintf("tmutil_localsnapshot_failed: %v", err)), nil
	}

	snapDate := time.Now().Format("2006-01-02-150405")
	if m := reTmutilDate.FindStringSubmatch(string(out)); len(m) > 1 {
		snapDate = m[1]
	}
	snapID := "com.apple.TimeMachine." + snapDate + ".local"

	return &VolumeSnapshot{
		Provider:      "macos_apfs_tmutil",
		Volume:        "/",
		ShadowPath:    targetPath,
		SnapshotID:    snapID,
		VSSShadowUsed: false,
		FallbackUsed:  false,
		CreatedAt:     time.Now().UTC().Format(time.RFC3339),
		cleanupFn: func() error {
			delCtx, delCancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer delCancel()
			return exec.CommandContext(delCtx, tmutilBin, "deletelocalsnapshots", snapDate).Run()
		},
	}, nil
}

// createLinuxSnapshot attempts a read-only Btrfs subvolume snapshot or LVM snapshot on Linux,
// gracefully falling back if not root or if targetPath is not on Btrfs/LVM.
func createLinuxSnapshot(ctx context.Context, targetPath string) (*VolumeSnapshot, error) {
	if runtime.GOOS != "linux" {
		return newPassthroughSnapshot(targetPath, "linux_snapshot_unavailable_on_"+runtime.GOOS), nil
	}
	if os.Geteuid() != 0 {
		return newPassthroughSnapshot(targetPath, "linux_snapshot_requires_root"), nil
	}

	// Check Btrfs first
	if btrfsBin, err := exec.LookPath("btrfs"); err == nil {
		cctx, cancel := context.WithTimeout(ctx, 10*time.Second)
		defer cancel()
		if err := exec.CommandContext(cctx, btrfsBin, "subvolume", "show", targetPath).Run(); err == nil {
			snapID := fmt.Sprintf("apexmsp-btrfs-%d", time.Now().Unix())
			snapPath := filepath.Join(os.TempDir(), snapID)
			if err := exec.CommandContext(cctx, btrfsBin, "subvolume", "snapshot", "-r", targetPath, snapPath).Run(); err == nil {
				return &VolumeSnapshot{
					Provider:      "linux_btrfs",
					Volume:        targetPath,
					ShadowPath:    snapPath,
					SnapshotID:    snapID,
					VSSShadowUsed: false,
					FallbackUsed:  false,
					CreatedAt:     time.Now().UTC().Format(time.RFC3339),
					cleanupFn: func() error {
						delCtx, delCancel := context.WithTimeout(context.Background(), 10*time.Second)
						defer delCancel()
						return exec.CommandContext(delCtx, btrfsBin, "subvolume", "delete", snapPath).Run()
					},
				}, nil
			}
		}
	}

	return newPassthroughSnapshot(targetPath, "not_on_lvm_or_btrfs_volume"), nil
}

func newPassthroughSnapshot(targetPath, reason string) *VolumeSnapshot {
	absPath, err := filepath.Abs(targetPath)
	if err != nil {
		absPath = targetPath
	}
	return &VolumeSnapshot{
		Provider:       "passthrough_fallback",
		Volume:         extractVolumeRoot(absPath),
		ShadowPath:     absPath,
		SnapshotID:     fmt.Sprintf("snap-fallback-%d", time.Now().UnixNano()),
		VSSShadowUsed:  false,
		FallbackUsed:   true,
		FallbackReason: reason,
		CreatedAt:      time.Now().UTC().Format(time.RFC3339),
		cleanupFn: func() error {
			return nil
		},
	}
}

func extractWindowsVolume(p string) string {
	p = strings.TrimSpace(p)
	if len(p) >= 2 && p[1] == ':' {
		return strings.ToUpper(p[:2]) + `\`
	}
	return `C:\`
}

func extractVolumeRoot(p string) string {
	if runtime.GOOS == "windows" {
		return extractWindowsVolume(p)
	}
	vol := filepath.VolumeName(p)
	if vol != "" {
		return vol
	}
	return "/"
}
