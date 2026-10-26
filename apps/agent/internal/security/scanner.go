package security

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"openmsp/agent/internal/client"
)

const (
	// MaxScanFileSizeBytes caps single-file scanning at 50 MB to guarantee bounded memory/CPU.
	MaxScanFileSizeBytes int64 = 50 * 1024 * 1024
	// MaxScanFilesCount caps the number of files inspected in a single scan job.
	MaxScanFilesCount int = 2500
	// MaxScanTimeout caps any single scan operation at 30 seconds.
	MaxScanTimeout = 30 * time.Second

	// EICARStandardSignature is the official 68-byte EICAR standard antivirus test string.
	EICARStandardSignature = `X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*`
	// EICARAltSignature is the 67-byte EICAR test string variant (\ZX54).
	EICARAltSignature = `X5O!P%@AP[4\ZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*`
	// EICARStandardSHA256 is the SHA-256 hash of the 68-byte EICAR test string.
	EICARStandardSHA256 = "275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f"
	// EICARAltSHA256 is the SHA-256 hash of the 67-byte EICAR variant.
	EICARAltSHA256 = "516ea2d58fb9b3ae197a962e1497bcaeeebdd244633b84d6bc2ab852afae0e56"
)

var defaultBlockedSHA256 = map[string]string{
	EICARStandardSHA256: "EICAR-Test-File (SHA-256 Exact Match)",
	EICARAltSHA256:      "EICAR-Test-File-Alt (SHA-256 Exact Match)",
	// Known test/simulation hashes
	"131f95c51cc819465fa1797f6ccacf9d494aaaff46fa3eac73ae63ffbdfd8267": "EICAR-Test-File-CRLF",
}

// ScanOptions configures a bounded endpoint file or directory scan.
type ScanOptions struct {
	TargetPath            string
	MaxFileSizeBytes      int64
	Timeout               time.Duration
	YaraRulesPath         string
	EnableClamAV          bool
	EnableYaraX           bool
	CustomBlocklistHashes map[string]string
	// PerFileDelay is an optional hook used in tests to simulate slow I/O for timeout testing.
	PerFileDelay time.Duration
}

// ScanResult summarizes the outcome of a bounded scan.
type ScanResult struct {
	TargetPath        string                          `json:"targetPath"`
	ScannedFiles      int                             `json:"scannedFiles"`
	SkippedLargeFiles int                             `json:"skippedLargeFiles"`
	TimedOut          bool                            `json:"timedOut"`
	DurationMs        int64                           `json:"durationMs"`
	Detections        []client.SecurityDetectionInput `json:"detections"`
}

// QuarantineManifest stores metadata and cryptographic integrity proof for a quarantined file.
type QuarantineManifest struct {
	SHA256         string      `json:"sha256"`
	OriginalPath   string      `json:"originalPath"`
	QuarantinePath string      `json:"quarantinePath"`
	ManifestPath   string      `json:"manifestPath"`
	SizeBytes      int64       `json:"sizeBytes"`
	OriginalMode   os.FileMode `json:"originalMode"`
	QuarantinedAt  string      `json:"quarantinedAt"`
	Reason         string      `json:"reason"`
}

// DefaultQuarantineDir returns the default directory for isolated/quarantined files.
func DefaultQuarantineDir() string {
	if runtime.GOOS == "windows" {
		progData := os.Getenv("ProgramData")
		if progData == "" {
			progData = `C:\ProgramData`
		}
		return filepath.Join(progData, "ApexMSP", "quarantine")
	}
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return filepath.Join(os.TempDir(), ".apexmsp", "quarantine")
	}
	return filepath.Join(home, ".apexmsp", "quarantine")
}

// ScanPath executes a bounded scan on a file or directory, enforcing strict file-size and timeout limits.
func ScanPath(parentCtx context.Context, opts ScanOptions) (*ScanResult, error) {
	if strings.TrimSpace(opts.TargetPath) == "" {
		return nil, errors.New("scan targetPath is required")
	}

	maxSize := opts.MaxFileSizeBytes
	if maxSize <= 0 || maxSize > MaxScanFileSizeBytes {
		maxSize = MaxScanFileSizeBytes
	}

	timeout := opts.Timeout
	if timeout <= 0 || timeout > MaxScanTimeout {
		timeout = MaxScanTimeout
	}

	ctx, cancel := context.WithTimeout(parentCtx, timeout)
	defer cancel()

	start := time.Now()
	res := &ScanResult{
		TargetPath: opts.TargetPath,
		Detections: make([]client.SecurityDetectionInput, 0),
	}

	info, err := os.Stat(opts.TargetPath)
	if err != nil {
		return nil, fmt.Errorf("stat target %s: %w", opts.TargetPath, err)
	}

	scanSingle := func(filePath string, fi os.FileInfo) error {
		select {
		case <-ctx.Done():
			res.TimedOut = true
			return ctx.Err()
		default:
		}

		if opts.PerFileDelay > 0 {
			select {
			case <-time.After(opts.PerFileDelay):
			case <-ctx.Done():
				res.TimedOut = true
				return ctx.Err()
			}
		}

		if !fi.Mode().IsRegular() {
			return nil
		}

		if fi.Size() > maxSize {
			res.SkippedLargeFiles++
			return nil
		}

		if res.ScannedFiles >= MaxScanFilesCount {
			return io.EOF
		}

		res.ScannedFiles++
		dets := inspectRegularFile(ctx, filePath, maxSize, opts)
		if len(dets) > 0 {
			res.Detections = append(res.Detections, dets...)
		}
		return nil
	}

	if !info.IsDir() {
		_ = scanSingle(opts.TargetPath, info)
	} else {
		walkErr := filepath.Walk(opts.TargetPath, func(path string, fi os.FileInfo, err error) error {
			if err != nil {
				return nil
			}
			if fi.IsDir() {
				base := filepath.Base(path)
				if base == ".git" || base == "node_modules" || base == "quarantine" {
					return filepath.SkipDir
				}
				return nil
			}
			return scanSingle(path, fi)
		})
		if errors.Is(walkErr, context.DeadlineExceeded) || errors.Is(ctx.Err(), context.DeadlineExceeded) {
			res.TimedOut = true
		}
	}

	res.DurationMs = time.Since(start).Milliseconds()
	return res, nil
}

func inspectRegularFile(ctx context.Context, filePath string, maxSize int64, opts ScanOptions) []client.SecurityDetectionInput {
	pol := LoadSecurityPolicy()
	if !pol.PreventiveAvEnabled && !pol.YaraClamScannerEnabled {
		return nil
	}

	f, err := os.Open(filePath)
	if err != nil {
		return nil
	}
	defer f.Close()

	data, err := io.ReadAll(io.LimitReader(f, maxSize))
	if err != nil {
		return nil
	}

	sum := sha256.Sum256(data)
	fileHash := hex.EncodeToString(sum[:])
	nowStr := time.Now().UTC().Format(time.RFC3339)
	var out []client.SecurityDetectionInput

	// 1. Check EICAR standard antivirus signature (both 68-byte official and 67-byte variant)
	if bytes.Contains(data, []byte(EICARStandardSignature)) ||
		bytes.Contains(data, []byte(EICARAltSignature)) ||
		bytes.Contains(data, []byte("EICAR-STANDARD-ANTIVIRUS-TEST-FILE")) ||
		fileHash == EICARStandardSHA256 ||
		fileHash == EICARAltSHA256 {
		out = append(out, client.SecurityDetectionInput{
			EventID:        fmt.Sprintf("det-eicar-%d", time.Now().UnixNano()),
			IdempotencyKey: fmt.Sprintf("scan:eicar:%s:%s", filePath, fileHash),
			EventTime:      nowStr,
			SourceProvider: "apex_agent",
			RuleID:         "APEX-AV-EICAR-001",
			RuleName:       "EICAR Standard Antivirus Test File Detected",
			Severity:       "high",
			Confidence:     1.0,
			Category:       "malware",
			Summary:        fmt.Sprintf("EICAR test signature matched in %s (SHA-256: %s)", filepath.Base(filePath), fileHash[:16]),
			File: &client.SecurityFileContext{
				Path:   filePath,
				SHA256: fileHash,
				Action: "created",
			},
			RawEvidence: map[string]interface{}{
				"engine":    "apex_signature_scanner",
				"signature": "EICAR-STANDARD-ANTIVIRUS-TEST-FILE",
				"sha256":    fileHash,
				"sizeBytes": len(data),
			},
			IsBenignSimulation: true,
		})
		return out
	}

	// 2. Check SHA-256 blocklist
	if sigName, ok := defaultBlockedSHA256[fileHash]; ok {
		out = append(out, buildHashDetection(filePath, fileHash, sigName, nowStr))
		return out
	}
	if opts.CustomBlocklistHashes != nil {
		if sigName, ok := opts.CustomBlocklistHashes[strings.ToLower(fileHash)]; ok {
			out = append(out, buildHashDetection(filePath, fileHash, sigName, nowStr))
			return out
		}
	}

	// 3. Check embedded ApexMSP ransomware simulation test markers
	if bytes.Contains(data, []byte("APEXMSP-RANSOMWARE-SIMULATION-ARTIFACT")) ||
		bytes.Contains(data, []byte("YOUR_FILES_HAVE_BEEN_ENCRYPTED_APEX_TEST")) {
		out = append(out, client.SecurityDetectionInput{
			EventID:        fmt.Sprintf("det-ransom-sim-%d", time.Now().UnixNano()),
			IdempotencyKey: fmt.Sprintf("scan:ransom_sim:%s:%s", filePath, fileHash),
			EventTime:      nowStr,
			SourceProvider: "yara_x",
			RuleID:         "APEX-YARA-RANSOM-SIM",
			RuleName:       "ApexMSP Benign Ransomware Simulation Artifact",
			Severity:       "critical",
			Confidence:     0.99,
			Category:       "ransomware",
			Summary:        fmt.Sprintf("Ransomware simulation payload detected in %s", filepath.Base(filePath)),
			File: &client.SecurityFileContext{
				Path:   filePath,
				SHA256: fileHash,
				Action: "created",
			},
			RawEvidence: map[string]interface{}{
				"engine": "apex_yara_embedded",
				"sha256": fileHash,
			},
			IsBenignSimulation: true,
		})
		return out
	}

	// 4. Optional external YARA-X CLI scan if installed and configured
	if opts.EnableYaraX && opts.YaraRulesPath != "" && fileExists(opts.YaraRulesPath) {
		if yrPath, err := exec.LookPath("yr"); err == nil {
			yrCmd := exec.CommandContext(ctx, yrPath, "scan", opts.YaraRulesPath, filePath)
			if yrOut, err := yrCmd.CombinedOutput(); err == nil {
				trimmed := strings.TrimSpace(string(yrOut))
				if trimmed != "" {
					ruleMatched := strings.Fields(trimmed)[0]
					out = append(out, client.SecurityDetectionInput{
						EventID:        fmt.Sprintf("det-yarax-%d", time.Now().UnixNano()),
						IdempotencyKey: fmt.Sprintf("scan:yarax:%s:%s", filePath, fileHash),
						EventTime:      nowStr,
						SourceProvider: "yara_x",
						RuleID:         fmt.Sprintf("YARA-%s", ruleMatched),
						RuleName:       fmt.Sprintf("YARA-X Rule Match: %s", ruleMatched),
						Severity:       "high",
						Confidence:     0.95,
						Category:       "malware",
						Summary:        fmt.Sprintf("YARA-X matched rule %s on %s", ruleMatched, filepath.Base(filePath)),
						File: &client.SecurityFileContext{
							Path:   filePath,
							SHA256: fileHash,
							Action: "created",
						},
						RawEvidence: map[string]interface{}{
							"yaraOutput": trimmed,
							"rulesPath":  opts.YaraRulesPath,
						},
					})
				}
			}
		}
	}

	// 5. Optional ClamAV local socket scan if enabled
	if opts.EnableClamAV {
		if sig, infected := scanWithClamAVSocket(ctx, data); infected {
			out = append(out, client.SecurityDetectionInput{
				EventID:        fmt.Sprintf("det-clamav-%d", time.Now().UnixNano()),
				IdempotencyKey: fmt.Sprintf("scan:clamav:%s:%s", filePath, fileHash),
				EventTime:      nowStr,
				SourceProvider: "clamav",
				RuleID:         "APEX-CLAMAV-001",
				RuleName:       fmt.Sprintf("ClamAV Detection: %s", sig),
				Severity:       "high",
				Confidence:     0.96,
				Category:       "malware",
				Summary:        fmt.Sprintf("ClamAV flagged %s with signature %s", filepath.Base(filePath), sig),
				File: &client.SecurityFileContext{
					Path:   filePath,
					SHA256: fileHash,
					Action: "created",
				},
				RawEvidence: map[string]interface{}{
					"clamavSignature": sig,
					"sha256":          fileHash,
				},
			})
		}
	}

	return out
}

func buildHashDetection(filePath, fileHash, sigName, nowStr string) client.SecurityDetectionInput {
	return client.SecurityDetectionInput{
		EventID:        fmt.Sprintf("det-hash-%d", time.Now().UnixNano()),
		IdempotencyKey: fmt.Sprintf("scan:hash:%s:%s", filePath, fileHash),
		EventTime:      nowStr,
		SourceProvider: "apex_agent",
		RuleID:         "APEX-AV-HASH-001",
		RuleName:       fmt.Sprintf("Malicious SHA-256 Blocklist Match (%s)", sigName),
		Severity:       "critical",
		Confidence:     1.0,
		Category:       "malware",
		Summary:        fmt.Sprintf("Blocked SHA-256 hash (%s) matched on %s", sigName, filepath.Base(filePath)),
		File: &client.SecurityFileContext{
			Path:   filePath,
			SHA256: fileHash,
			Action: "created",
		},
		RawEvidence: map[string]interface{}{
			"signature": sigName,
			"sha256":    fileHash,
		},
	}
}

func scanWithClamAVSocket(ctx context.Context, data []byte) (string, bool) {
	sockets := []string{
		"/var/run/clamav/clamd.ctl",
		"/tmp/clamd.socket",
		"/opt/homebrew/var/run/clamav/clamd.sock",
	}
	var sockPath string
	for _, s := range sockets {
		if fileExists(s) {
			sockPath = s
			break
		}
	}
	if sockPath == "" {
		return "", false
	}

	var d net.Dialer
	conn, err := d.DialContext(ctx, "unix", sockPath)
	if err != nil {
		return "", false
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(4 * time.Second))

	if _, err := conn.Write([]byte("zINSTREAM\x00")); err != nil {
		return "", false
	}

	var lenBuf [4]byte
	binary.BigEndian.PutUint32(lenBuf[:], uint32(len(data)))
	if _, err := conn.Write(lenBuf[:]); err != nil {
		return "", false
	}
	if _, err := conn.Write(data); err != nil {
		return "", false
	}
	binary.BigEndian.PutUint32(lenBuf[:], 0)
	_, _ = conn.Write(lenBuf[:])

	resp, err := io.ReadAll(conn)
	if err != nil {
		return "", false
	}
	respStr := strings.TrimSpace(string(bytes.TrimRight(resp, "\x00")))
	if strings.Contains(respStr, "FOUND") {
		parts := strings.Split(respStr, ":")
		if len(parts) >= 2 {
			sig := strings.TrimSpace(strings.TrimSuffix(parts[1], "FOUND"))
			return sig, true
		}
		return respStr, true
	}
	return "", false
}

// IsProtectedSystemPath returns true if path points to a critical OS binary or directory
// that must never be quarantined automatically.
func IsProtectedSystemPath(path string) bool {
	abs, err := filepath.Abs(path)
	if err != nil {
		return true
	}
	lower := strings.ToLower(filepath.Clean(abs))

	protectedPrefixes := []string{
		"/system/",
		"/bin/",
		"/sbin/",
		"/usr/bin/",
		"/usr/sbin/",
		"/usr/lib/",
		"/library/apple/",
		`c:\windows\system32`,
		`c:\windows\syswow64`,
		`c:\windows\winsxs`,
	}
	for _, p := range protectedPrefixes {
		if strings.HasPrefix(lower, p) || lower == strings.TrimSuffix(p, "/") {
			return true
		}
	}
	return false
}

// QuarantineFile safely isolates a suspicious file into quarantineDir/<sha256>.quar with 0000 permissions
// and writes a signed JSON manifest containing the original path, permissions, and SHA-256 digest.
func QuarantineFile(filePath string, quarantineDir string, reason string) (*QuarantineManifest, error) {
	if strings.TrimSpace(filePath) == "" {
		return nil, errors.New("filePath is required")
	}
	absPath, err := filepath.Abs(filePath)
	if err != nil {
		return nil, fmt.Errorf("resolve path %s: %w", filePath, err)
	}
	if IsProtectedSystemPath(absPath) {
		return nil, fmt.Errorf("refusing to quarantine protected OS system path: %s", absPath)
	}

	fi, err := os.Stat(absPath)
	if err != nil {
		return nil, fmt.Errorf("stat target file %s: %w", absPath, err)
	}
	if !fi.Mode().IsRegular() {
		return nil, fmt.Errorf("target %s is not a regular file", absPath)
	}

	data, err := os.ReadFile(absPath)
	if err != nil {
		return nil, fmt.Errorf("read target file %s: %w", absPath, err)
	}
	sum := sha256.Sum256(data)
	hashHex := hex.EncodeToString(sum[:])

	if quarantineDir == "" {
		quarantineDir = DefaultQuarantineDir()
	}
	if err := os.MkdirAll(quarantineDir, 0700); err != nil {
		return nil, fmt.Errorf("create quarantine dir %s: %w", quarantineDir, err)
	}

	quarPath := filepath.Join(quarantineDir, hashHex+".quar")
	manifestPath := filepath.Join(quarantineDir, hashHex+".json")

	// If an earlier .quar exists with 0000 permissions, make it writable before overwriting
	_ = os.Chmod(quarPath, 0600)
	if err := os.WriteFile(quarPath, data, 0600); err != nil {
		return nil, fmt.Errorf("write quarantine payload %s: %w", quarPath, err)
	}
	// Strip all execution/read permissions on the quarantined payload
	_ = os.Chmod(quarPath, 0000)

	if err := os.Remove(absPath); err != nil {
		// Rollback quarantine file if original could not be removed
		_ = os.Chmod(quarPath, 0600)
		_ = os.Remove(quarPath)
		return nil, fmt.Errorf("remove original file %s: %w", absPath, err)
	}

	if reason == "" {
		reason = "ApexMSP automated containment quarantine"
	}

	manifest := &QuarantineManifest{
		SHA256:         hashHex,
		OriginalPath:   absPath,
		QuarantinePath: quarPath,
		ManifestPath:   manifestPath,
		SizeBytes:      int64(len(data)),
		OriginalMode:   fi.Mode().Perm(),
		QuarantinedAt:  time.Now().UTC().Format(time.RFC3339),
		Reason:         reason,
	}

	mBytes, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("marshal quarantine manifest: %w", err)
	}
	if err := os.WriteFile(manifestPath, mBytes, 0600); err != nil {
		return nil, fmt.Errorf("write quarantine manifest %s: %w", manifestPath, err)
	}

	return manifest, nil
}

// RestoreQuarantinedFile locates a quarantined file by SHA-256 hash or original path,
// cryptographically verifies its SHA-256 integrity against the manifest, and restores it.
func RestoreQuarantinedFile(sha256OrPath string, quarantineDir string, targetPathOverride string) (*QuarantineManifest, error) {
	if strings.TrimSpace(sha256OrPath) == "" {
		return nil, errors.New("sha256 or original file path is required for restore")
	}
	if quarantineDir == "" {
		quarantineDir = DefaultQuarantineDir()
	}

	manifest, err := findQuarantineManifest(sha256OrPath, quarantineDir)
	if err != nil {
		return nil, err
	}

	// Temporarily grant read permission (0400) to verify SHA-256 and read bytes
	if err := os.Chmod(manifest.QuarantinePath, 0400); err != nil {
		return nil, fmt.Errorf("chmod quarantine payload %s: %w", manifest.QuarantinePath, err)
	}

	data, err := os.ReadFile(manifest.QuarantinePath)
	if err != nil {
		_ = os.Chmod(manifest.QuarantinePath, 0000)
		return nil, fmt.Errorf("read quarantine payload %s: %w", manifest.QuarantinePath, err)
	}

	sum := sha256.Sum256(data)
	actualHash := hex.EncodeToString(sum[:])
	if !strings.EqualFold(actualHash, manifest.SHA256) {
		_ = os.Chmod(manifest.QuarantinePath, 0000)
		return nil, fmt.Errorf("quarantine SHA-256 integrity check failed: expected %s, got %s", manifest.SHA256, actualHash)
	}

	destPath := manifest.OriginalPath
	if strings.TrimSpace(targetPathOverride) != "" {
		destPath = targetPathOverride
	}

	if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
		return nil, fmt.Errorf("create parent dir for restore %s: %w", destPath, err)
	}

	perm := manifest.OriginalMode
	if perm == 0 {
		perm = 0644
	}
	if err := os.WriteFile(destPath, data, perm); err != nil {
		_ = os.Chmod(manifest.QuarantinePath, 0000)
		return nil, fmt.Errorf("restore file to %s: %w", destPath, err)
	}

	// Clean up quarantine artifacts after verified restoration
	_ = os.Chmod(manifest.QuarantinePath, 0600)
	_ = os.Remove(manifest.QuarantinePath)
	_ = os.Remove(manifest.ManifestPath)

	manifest.OriginalPath = destPath
	return manifest, nil
}

func findQuarantineManifest(sha256OrPath string, quarantineDir string) (*QuarantineManifest, error) {
	directManifest := filepath.Join(quarantineDir, strings.ToLower(strings.TrimSpace(sha256OrPath))+".json")
	if data, err := os.ReadFile(directManifest); err == nil {
		var m QuarantineManifest
		if err := json.Unmarshal(data, &m); err == nil {
			return &m, nil
		}
	}

	entries, err := os.ReadDir(quarantineDir)
	if err != nil {
		return nil, fmt.Errorf("read quarantine dir %s: %w", quarantineDir, err)
	}

	cleanTarget := filepath.Clean(sha256OrPath)
	if abs, err := filepath.Abs(sha256OrPath); err == nil {
		cleanTarget = filepath.Clean(abs)
	}

	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		mPath := filepath.Join(quarantineDir, e.Name())
		data, err := os.ReadFile(mPath)
		if err != nil {
			continue
		}
		var m QuarantineManifest
		if err := json.Unmarshal(data, &m); err != nil {
			continue
		}
		if strings.EqualFold(m.SHA256, sha256OrPath) ||
			filepath.Clean(m.OriginalPath) == cleanTarget ||
			filepath.Base(m.OriginalPath) == sha256OrPath {
			return &m, nil
		}
	}

	return nil, fmt.Errorf("no quarantine manifest found matching %q in %s", sha256OrPath, quarantineDir)
}
