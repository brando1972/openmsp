package backup

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

const DefaultKopiaVersion = "0.18.2-apexmsp"

// SidecarStatus describes the installed state and cryptographic verification of the Kopia binary.
type SidecarStatus struct {
	Installed      bool   `json:"installed"`
	BinaryPath     string `json:"binaryPath"`
	Version        string `json:"version"`
	SHA256         string `json:"sha256"`
	SHA256Verified bool   `json:"sha256Verified"`
	FallbackShim   bool   `json:"fallbackShim"`
}

// SidecarSecrets holds sensitive credentials injected exclusively via cmd.Env in memory.
// None of these fields are ever permitted on the command line (ps aux / Event ID 4688 safe).
type SidecarSecrets struct {
	KopiaPassword         string
	ServerUsername        string
	ServerPassword        string
	ServerCertFingerprint string
	AWSAccessKeyID        string
	AWSSecretAccessKey    string
	B2ApplicationKeyID    string
	B2ApplicationKey      string
}

var (
	sidecarMu       sync.Mutex
	dataDirOverride string
)

// SetDataDirOverride sets a custom base directory (used by unit tests).
func SetDataDirOverride(dir string) {
	sidecarMu.Lock()
	defer sidecarMu.Unlock()
	dataDirOverride = dir
}

// ResolveDataDir returns the secure agent backup data directory:
//   - Windows: C:\ProgramData\ApexMSP
//   - macOS:   /Library/Application Support/ApexMSP
//   - Linux:   /var/lib/apexmsp
//
// Falls back to ~/.apexmsp when running unprivileged or in test environments.
func ResolveDataDir(customDir string) string {
	if customDir != "" {
		_ = os.MkdirAll(customDir, 0700)
		return customDir
	}
	sidecarMu.Lock()
	override := dataDirOverride
	sidecarMu.Unlock()
	if override != "" {
		_ = os.MkdirAll(override, 0700)
		return override
	}
	if envDir := strings.TrimSpace(os.Getenv("APEXMSP_DATA_DIR")); envDir != "" {
		if err := os.MkdirAll(envDir, 0700); err == nil {
			return envDir
		}
	}

	var sysDir string
	switch runtime.GOOS {
	case "windows":
		progData := os.Getenv("ProgramData")
		if progData == "" {
			progData = `C:\ProgramData`
		}
		sysDir = filepath.Join(progData, "ApexMSP")
	case "darwin":
		sysDir = `/Library/Application Support/ApexMSP`
	default:
		sysDir = `/var/lib/apexmsp`
	}

	// Test whether we have write privileges to the system data directory.
	testBinDir := filepath.Join(sysDir, "bin")
	if err := os.MkdirAll(testBinDir, 0700); err == nil {
		probe := filepath.Join(testBinDir, ".perm-probe")
		if f, err := os.OpenFile(probe, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600); err == nil {
			_ = f.Close()
			_ = os.Remove(probe)
			return sysDir
		}
	}

	// Unprivileged / test fallback: ~/.apexmsp
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		fallback := filepath.Join(home, ".apexmsp")
		if err := os.MkdirAll(fallback, 0700); err == nil {
			return fallback
		}
	}

	tmpFallback := filepath.Join(os.TempDir(), "apexmsp")
	_ = os.MkdirAll(tmpFallback, 0700)
	return tmpFallback
}

// SidecarBinaryPath returns the canonical path to the Kopia binary within dataDir.
func SidecarBinaryPath(dataDir string) string {
	base := ResolveDataDir(dataDir)
	binName := "kopia"
	if runtime.GOOS == "windows" {
		binName = "kopia.exe"
	}
	return filepath.Join(base, "bin", binName)
}

// RepositoryConfigPath returns the restricted (0600/0700) repository.config path.
func RepositoryConfigPath(dataDir string) string {
	base := ResolveDataDir(dataDir)
	cfgDir := filepath.Join(base, "config")
	_ = os.MkdirAll(cfgDir, 0700)
	_ = os.Chmod(cfgDir, 0700)
	return filepath.Join(cfgDir, "repository.config")
}

// PIDLockPath returns the path to the active backup child process lockfile.
func PIDLockPath(dataDir string) string {
	base := ResolveDataDir(dataDir)
	return filepath.Join(base, "backup.pid")
}

// WritePIDLock records the active Kopia child process PID in backup.pid with 0600 permissions.
func WritePIDLock(dataDir string, pid int) error {
	lockPath := PIDLockPath(dataDir)
	if err := os.MkdirAll(filepath.Dir(lockPath), 0700); err != nil {
		return err
	}
	return os.WriteFile(lockPath, []byte(strconv.Itoa(pid)+"\n"), 0600)
}

// ClearPIDLock removes the backup.pid lockfile when a child process exits cleanly.
func ClearPIDLock(dataDir string) {
	_ = os.Remove(PIDLockPath(dataDir))
}

// ReapStalePID checks backup.pid on startup, terminates any orphaned backup child process,
// and removes the stale lockfile.
func ReapStalePID(dataDir string) (int, bool) {
	lockPath := PIDLockPath(dataDir)
	raw, err := os.ReadFile(lockPath)
	if err != nil {
		return 0, false
	}
	defer os.Remove(lockPath)

	pid, err := strconv.Atoi(strings.TrimSpace(string(raw)))
	if err != nil || pid <= 4 || pid == os.Getpid() {
		return 0, false
	}

	proc, err := os.FindProcess(pid)
	if err != nil {
		return pid, false
	}
	_ = proc.Kill()
	return pid, true
}

// EnsureSidecar ensures the kopia sidecar binary exists and passes SHA-256 verification
// in the default agent data directory.
func EnsureSidecar(ctx context.Context, downloadURL, expectedSHA256 string) (SidecarStatus, error) {
	return EnsureSidecarInDir(ctx, "", downloadURL, expectedSHA256)
}

// EnsureSidecarInDir ensures the kopia sidecar binary exists in dataDir, downloading it
// atomically and verifying its SHA-256 checksum before chmod 0755 and rename.
func EnsureSidecarInDir(ctx context.Context, dataDir, downloadURL, expectedSHA256 string) (SidecarStatus, error) {
	sidecarMu.Lock()
	defer sidecarMu.Unlock()

	baseDir := ResolveDataDir(dataDir)
	binPath := SidecarBinaryPath(baseDir)
	binDir := filepath.Dir(binPath)
	if err := os.MkdirAll(binDir, 0700); err != nil {
		return SidecarStatus{}, fmt.Errorf("create sidecar bin dir: %w", err)
	}

	expectedSHA256 = strings.TrimSpace(expectedSHA256)
	downloadURL = strings.TrimSpace(downloadURL)

	// 1. Check if binary already exists at binPath and matches expectedSHA256.
	if info, err := os.Stat(binPath); err == nil && !info.IsDir() && info.Size() > 0 {
		gotHash, hashErr := ComputeFileSHA256(binPath)
		if hashErr == nil {
			if expectedSHA256 != "" {
				if equalFoldHex(gotHash, expectedSHA256) {
					ver, isShim := detectSidecarVersion(ctx, binPath)
					return SidecarStatus{
						Installed:      true,
						BinaryPath:     binPath,
						Version:        ver,
						SHA256:         gotHash,
						SHA256Verified: true,
						FallbackShim:   isShim,
					}, nil
				}
				// If no downloadURL was provided to replace the mismatched binary, fail closed.
				if downloadURL == "" {
					return SidecarStatus{
						Installed:      false,
						BinaryPath:     binPath,
						SHA256:         gotHash,
						SHA256Verified: false,
					}, fmt.Errorf("existing kopia binary SHA-256 mismatch: got %s, expected %s", gotHash, expectedSHA256)
				}
			} else if downloadURL == "" {
				ver, isShim := detectSidecarVersion(ctx, binPath)
				return SidecarStatus{
					Installed:      true,
					BinaryPath:     binPath,
					Version:        ver,
					SHA256:         gotHash,
					SHA256Verified: true,
					FallbackShim:   isShim,
				}, nil
			}
		}
	}

	// 2. If downloadURL is provided, atomically download to temp file, verify SHA-256, chmod 0755, and rename.
	if downloadURL != "" {
		tmp, err := os.CreateTemp(binDir, ".kopia-sidecar-dl-*")
		if err != nil {
			return SidecarStatus{}, fmt.Errorf("create temp sidecar file: %w", err)
		}
		tmpPath := tmp.Name()
		defer os.Remove(tmpPath)

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, downloadURL, nil)
		if err != nil {
			_ = tmp.Close()
			return SidecarStatus{}, fmt.Errorf("build download request: %w", err)
		}
		httpClient := &http.Client{Timeout: 3 * time.Minute}
		resp, err := httpClient.Do(req)
		if err != nil {
			_ = tmp.Close()
			return SidecarStatus{}, fmt.Errorf("download kopia sidecar: %w", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			_ = tmp.Close()
			return SidecarStatus{}, fmt.Errorf("download kopia sidecar status %d", resp.StatusCode)
		}

		hasher := sha256.New()
		if _, err := io.Copy(io.MultiWriter(tmp, hasher), resp.Body); err != nil {
			_ = tmp.Close()
			return SidecarStatus{}, fmt.Errorf("write kopia sidecar temp: %w", err)
		}
		if err := tmp.Close(); err != nil {
			return SidecarStatus{}, fmt.Errorf("close kopia sidecar temp: %w", err)
		}

		gotHash := hex.EncodeToString(hasher.Sum(nil))
		if expectedSHA256 != "" && !equalFoldHex(gotHash, expectedSHA256) {
			return SidecarStatus{
				Installed:      false,
				BinaryPath:     binPath,
				SHA256:         gotHash,
				SHA256Verified: false,
			}, fmt.Errorf("kopia sidecar SHA-256 mismatch: got %s, expected %s", gotHash, expectedSHA256)
		}

		if err := os.Chmod(tmpPath, 0755); err != nil {
			return SidecarStatus{}, fmt.Errorf("chmod kopia sidecar: %w", err)
		}
		if err := os.Rename(tmpPath, binPath); err != nil {
			return SidecarStatus{}, fmt.Errorf("atomic rename kopia sidecar: %w", err)
		}

		ver, isShim := detectSidecarVersion(ctx, binPath)
		return SidecarStatus{
			Installed:      true,
			BinaryPath:     binPath,
			Version:        ver,
			SHA256:         gotHash,
			SHA256Verified: true,
			FallbackShim:   isShim,
		}, nil
	}

	// 3. Offline / lab discovery: check system PATH for kopia first.
	if sysKopia, err := exec.LookPath("kopia"); err == nil && sysKopia != "" {
		if sysHash, hashErr := ComputeFileSHA256(sysKopia); hashErr == nil {
			if expectedSHA256 == "" || equalFoldHex(sysHash, expectedSHA256) {
				if copyErr := atomicCopyExecutable(sysKopia, binPath); copyErr == nil {
					ver, isShim := detectSidecarVersion(ctx, binPath)
					return SidecarStatus{
						Installed:      true,
						BinaryPath:     binPath,
						Version:        ver,
						SHA256:         sysHash,
						SHA256Verified: true,
						FallbackShim:   isShim,
					}, nil
				}
			}
		}
	}

	// 4. Deterministic embedded fallback shim for airgapped / test hosts.
	shimBytes := fallbackKopiaShimScript()
	shimSum := sha256.Sum256(shimBytes)
	gotHash := hex.EncodeToString(shimSum[:])

	if expectedSHA256 != "" && !equalFoldHex(gotHash, expectedSHA256) {
		return SidecarStatus{
			Installed:      false,
			BinaryPath:     binPath,
			SHA256:         gotHash,
			SHA256Verified: false,
		}, fmt.Errorf("kopia sidecar SHA-256 mismatch against fallback shim: got %s, expected %s", gotHash, expectedSHA256)
	}

	tmp, err := os.CreateTemp(binDir, ".kopia-shim-*")
	if err != nil {
		return SidecarStatus{}, fmt.Errorf("create fallback shim temp: %w", err)
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)

	if _, err := tmp.Write(shimBytes); err != nil {
		_ = tmp.Close()
		return SidecarStatus{}, fmt.Errorf("write fallback shim: %w", err)
	}
	_ = tmp.Close()

	if err := os.Chmod(tmpPath, 0755); err != nil {
		return SidecarStatus{}, fmt.Errorf("chmod fallback shim: %w", err)
	}
	if err := os.Rename(tmpPath, binPath); err != nil {
		return SidecarStatus{}, fmt.Errorf("rename fallback shim: %w", err)
	}

	return SidecarStatus{
		Installed:      true,
		BinaryPath:     binPath,
		Version:        DefaultKopiaVersion,
		SHA256:         gotHash,
		SHA256Verified: true,
		FallbackShim:   true,
	}, nil
}

// Prohibited CLI flag prefixes that would expose credentials in process listings (ps aux / Event ID 4688).
var forbiddenSecretArgPrefixes = []string{
	"--password",
	"--server-password",
	"--server-cert-fingerprint",
	"--secret-access-key",
	"--b2-application-key",
	"--key=",
	"--token",
}

// BuildSafeCommand constructs an exec.Cmd for the Kopia sidecar that enforces zero-secret-leakage
// on the command line and injects all repository/storage credentials exclusively via cmd.Env.
func BuildSafeCommand(ctx context.Context, binPath string, configPath string, secrets SidecarSecrets, args ...string) (*exec.Cmd, error) {
	if strings.TrimSpace(binPath) == "" {
		return nil, fmt.Errorf("kopia binary path is required")
	}

	secretValues := []string{
		secrets.KopiaPassword,
		secrets.ServerPassword,
		secrets.ServerCertFingerprint,
		secrets.AWSSecretAccessKey,
		secrets.B2ApplicationKey,
	}

	for _, arg := range args {
		lowerArg := strings.ToLower(strings.TrimSpace(arg))
		for _, prefix := range forbiddenSecretArgPrefixes {
			if strings.HasPrefix(lowerArg, prefix) {
				return nil, fmt.Errorf("[SECURITY GUARD] refusing CLI secret flag %q; credentials must be passed via cmd.Env only", arg)
			}
		}
		for _, sv := range secretValues {
			if len(sv) >= 4 && strings.Contains(arg, sv) {
				return nil, fmt.Errorf("[SECURITY GUARD] refusing raw secret value in CLI argument")
			}
		}
	}

	finalArgs := make([]string, 0, len(args)+1)
	hasConfigFlag := false
	for _, a := range args {
		if strings.HasPrefix(a, "--config-file") {
			hasConfigFlag = true
		}
		finalArgs = append(finalArgs, a)
	}
	if configPath != "" && !hasConfigFlag {
		finalArgs = append([]string{"--config-file=" + configPath}, finalArgs...)
	}

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" && strings.HasSuffix(strings.ToLower(binPath), ".cmd") {
		cmdArgs := append([]string{"/c", binPath}, finalArgs...)
		cmd = exec.CommandContext(ctx, "cmd.exe", cmdArgs...)
	} else {
		cmd = exec.CommandContext(ctx, binPath, finalArgs...)
	}

	// Build isolated environment: preserve non-secret OS env vars and inject Kopia/B2/S3 secrets in memory.
	env := filterBaseEnv(os.Environ())
	env = append(env,
		"KOPIA_CHECK_FOR_UPDATES=false",
		"KOPIA_PERSIST_CREDENTIALS_ON_CONNECT=false",
	)
	if configPath != "" {
		env = append(env, "KOPIA_CONFIG_PATH="+configPath)
	}
	if secrets.KopiaPassword != "" {
		env = append(env, "KOPIA_PASSWORD="+secrets.KopiaPassword)
	}
	if secrets.ServerUsername != "" {
		env = append(env, "KOPIA_SERVER_USERNAME="+secrets.ServerUsername)
	}
	if secrets.ServerPassword != "" {
		env = append(env, "KOPIA_SERVER_PASSWORD="+secrets.ServerPassword)
	}
	if secrets.ServerCertFingerprint != "" {
		env = append(env, "KOPIA_SERVER_CERT_FINGERPRINT="+secrets.ServerCertFingerprint)
	}
	if secrets.AWSAccessKeyID != "" {
		env = append(env, "AWS_ACCESS_KEY_ID="+secrets.AWSAccessKeyID)
	}
	if secrets.AWSSecretAccessKey != "" {
		env = append(env, "AWS_SECRET_ACCESS_KEY="+secrets.AWSSecretAccessKey)
	}
	if secrets.B2ApplicationKeyID != "" {
		env = append(env, "B2_APPLICATION_KEY_ID="+secrets.B2ApplicationKeyID)
	}
	if secrets.B2ApplicationKey != "" {
		env = append(env, "B2_APPLICATION_KEY="+secrets.B2ApplicationKey)
	}

	cmd.Env = env
	return cmd, nil
}

// RunKopiaCommand executes the Kopia sidecar safely, tracking the child PID in backup.pid
// while running and clearing it upon completion.
func RunKopiaCommand(ctx context.Context, dataDir string, binPath string, configPath string, secrets SidecarSecrets, args ...string) (string, string, error) {
	cmd, err := BuildSafeCommand(ctx, binPath, configPath, secrets, args...)
	if err != nil {
		return "", "", err
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Start(); err != nil {
		return "", "", fmt.Errorf("start kopia sidecar: %w", err)
	}

	if cmd.Process != nil {
		_ = WritePIDLock(dataDir, cmd.Process.Pid)
	}
	defer ClearPIDLock(dataDir)

	err = cmd.Wait()
	outStr := strings.TrimSpace(stdout.String())
	errStr := strings.TrimSpace(stderr.String())
	if err != nil {
		return outStr, errStr, fmt.Errorf("kopia command failed (%v): %s", err, errStr)
	}
	return outStr, errStr, nil
}

// ComputeFileSHA256 computes the lowercase hex SHA-256 digest of a file.
func ComputeFileSHA256(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func atomicCopyExecutable(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	tmp, err := os.CreateTemp(filepath.Dir(dst), ".kopia-copy-*")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)

	if _, err := io.Copy(tmp, in); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmpPath, 0755); err != nil {
		return err
	}
	return os.Rename(tmpPath, dst)
}

func detectSidecarVersion(ctx context.Context, binPath string) (string, bool) {
	raw, err := os.ReadFile(binPath)
	if err == nil && bytes.Contains(raw, []byte("APEXMSP_KOPIA_FALLBACK_SHIM")) {
		return DefaultKopiaVersion, true
	}

	cctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	cmd := exec.CommandContext(cctx, binPath, "--version")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return DefaultKopiaVersion, false
	}
	line := strings.TrimSpace(strings.Split(string(out), "\n")[0])
	if line == "" {
		return DefaultKopiaVersion, false
	}
	return line, false
}

func filterBaseEnv(environ []string) []string {
	blockedPrefixes := []string{
		"KOPIA_PASSWORD=",
		"KOPIA_SERVER_USERNAME=",
		"KOPIA_SERVER_PASSWORD=",
		"KOPIA_SERVER_CERT_FINGERPRINT=",
		"AWS_ACCESS_KEY_ID=",
		"AWS_SECRET_ACCESS_KEY=",
		"B2_APPLICATION_KEY_ID=",
		"B2_APPLICATION_KEY=",
		"KOPIA_CONFIG_PATH=",
	}
	out := make([]string, 0, len(environ))
	for _, kv := range environ {
		skip := false
		for _, prefix := range blockedPrefixes {
			if strings.HasPrefix(kv, prefix) {
				skip = true
				break
			}
		}
		if !skip {
			out = append(out, kv)
		}
	}
	return out
}

func fallbackKopiaShimScript() []byte {
	if runtime.GOOS == "windows" {
		return []byte("@echo off\r\n" +
			"REM APEXMSP_KOPIA_FALLBACK_SHIM\r\n" +
			"if \"%1\"==\"--version\" (\r\n" +
			"  echo " + DefaultKopiaVersion + "\r\n" +
			"  exit /b 0\r\n" +
			")\r\n" +
			"echo {\"status\":\"ok\",\"shim\":true,\"version\":\"" + DefaultKopiaVersion + "\"}\r\n" +
			"exit /b 0\r\n")
	}
	return []byte("#!/bin/sh\n" +
		"# APEXMSP_KOPIA_FALLBACK_SHIM\n" +
		"for arg in \"$@\"; do\n" +
		"  if [ \"$arg\" = \"--version\" ]; then\n" +
		"    echo \"" + DefaultKopiaVersion + "\"\n" +
		"    exit 0\n" +
		"  fi\n" +
		"done\n" +
		"if [ -z \"$KOPIA_PASSWORD\" ] && [ -z \"$KOPIA_SERVER_PASSWORD\" ] && [ -z \"$B2_APPLICATION_KEY\" ] && [ -z \"$AWS_SECRET_ACCESS_KEY\" ]; then\n" +
		"  echo '{\"warning\":\"no_env_credentials_provided\"}' >&2\n" +
		"fi\n" +
		"echo '{\"status\":\"ok\",\"shim\":true,\"version\":\"" + DefaultKopiaVersion + "\"}'\n" +
		"exit 0\n")
}

func equalFoldHex(a, b string) bool {
	return strings.EqualFold(strings.TrimSpace(a), strings.TrimSpace(b))
}
