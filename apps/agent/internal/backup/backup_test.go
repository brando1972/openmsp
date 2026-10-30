package backup

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestEnsureSidecarSHA256Verification(t *testing.T) {
	ctx := context.Background()
	tmpDir := t.TempDir()

	fakeBinPayload := []byte("#!/bin/sh\n# APEXMSP_KOPIA_FALLBACK_SHIM\necho \"0.18.2-test\"\nexit 0\n")
	if runtime.GOOS == "windows" {
		fakeBinPayload = []byte("@echo off\r\nREM APEXMSP_KOPIA_FALLBACK_SHIM\r\necho 0.18.2-test\r\n")
	}
	expectedSum := sha256.Sum256(fakeBinPayload)
	expectedHex := hex.EncodeToString(expectedSum[:])

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(fakeBinPayload)
	}))
	defer srv.Close()

	// 1. Tampered / mismatched SHA-256 must fail closed and refuse installation.
	badSHA := strings.Repeat("a", 64)
	_, err := EnsureSidecarInDir(ctx, tmpDir, srv.URL+"/kopia", badSHA)
	if err == nil {
		t.Fatalf("expected SHA-256 mismatch error, got nil")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "mismatch") {
		t.Fatalf("unexpected error message: %v", err)
	}
	if _, statErr := os.Stat(SidecarBinaryPath(tmpDir)); !os.IsNotExist(statErr) {
		t.Fatalf("expected binary NOT to exist after failed SHA-256 verification")
	}

	// 2. Valid SHA-256 must succeed, chmod 0755, and atomically install.
	st, err := EnsureSidecarInDir(ctx, tmpDir, srv.URL+"/kopia", strings.ToUpper(expectedHex))
	if err != nil {
		t.Fatalf("EnsureSidecarInDir with valid SHA-256 failed: %v", err)
	}
	if !st.Installed || !st.SHA256Verified {
		t.Fatalf("expected Installed=true and SHA256Verified=true, got %+v", st)
	}
	if !strings.EqualFold(st.SHA256, expectedHex) {
		t.Fatalf("got SHA256 %s, want %s", st.SHA256, expectedHex)
	}

	// 3. Offline fallback shim when no URL is given in a fresh dir.
	offlineDir := t.TempDir()
	offlineSt, err := EnsureSidecarInDir(ctx, offlineDir, "", "")
	if err != nil {
		t.Fatalf("offline EnsureSidecarInDir failed: %v", err)
	}
	if !offlineSt.Installed || !offlineSt.SHA256Verified || offlineSt.BinaryPath == "" {
		t.Fatalf("unexpected offline sidecar status: %+v", offlineSt)
	}
}

func TestZeroSecretLeakageAndPIDLock(t *testing.T) {
	ctx := context.Background()
	tmpDir := t.TempDir()

	secrets := SidecarSecrets{
		KopiaPassword:         "SuperSecretRepoPass!99",
		ServerUsername:        "agent-node-01@apexmsp",
		ServerPassword:        "UltraSecretServerToken#42",
		ServerCertFingerprint: "9F86D081884C7D659A2FEAA0C55AD015A3BF4F1B2B0B822CD15D6C15B0F00A08",
		B2ApplicationKeyID:    "005abc123def",
		B2ApplicationKey:      "K005SecretB2KeyMaterialXYZ",
	}

	// 1. CLI secret flags must be blocked.
	_, err := BuildSafeCommand(ctx, "/usr/local/bin/kopia", "/tmp/repo.config", secrets,
		"repository", "connect", "server", "--password=leaked")
	if err == nil {
		t.Fatalf("expected BuildSafeCommand to reject --password CLI flag")
	}

	// 2. Raw secret value in CLI args must be blocked.
	_, err = BuildSafeCommand(ctx, "/usr/local/bin/kopia", "/tmp/repo.config", secrets,
		"repository", "connect", "server", secrets.ServerPassword)
	if err == nil {
		t.Fatalf("expected BuildSafeCommand to reject raw secret value in CLI args")
	}

	// 3. Engine.Configure for UniFi NAS Kopia Server & Backblaze B2 must never put secrets in CLI args
	// or in config/repository.config, and must inject them via cmd.Env.
	eng := NewEngine(tmpDir)
	cfgRes, err := eng.Configure(ctx, map[string]interface{}{
		"vaultId":               "vault-unifi-01",
		"backendType":           "unifi_nas_kopia",
		"endpointUrl":           "https://192.168.1.250:51515",
		"kopiaPassword":         secrets.KopiaPassword,
		"serverUsername":        secrets.ServerUsername,
		"serverPassword":        secrets.ServerPassword,
		"serverCertFingerprint": secrets.ServerCertFingerprint,
		"appendOnlyEnforced":    true,
	})
	if err != nil {
		t.Fatalf("Engine.Configure failed: %v", err)
	}
	if !cfgRes.RepositoryConnected || !cfgRes.AppendOnlyMode {
		t.Fatalf("expected RepositoryConnected=true and AppendOnlyMode=true, got %+v", cfgRes)
	}

	args, env := eng.LastCommandInvocation()
	joinedArgs := strings.Join(args, " ")
	for _, forbidden := range []string{secrets.KopiaPassword, secrets.ServerPassword, secrets.ServerCertFingerprint, "--password", "--server-password"} {
		if strings.Contains(joinedArgs, forbidden) {
			t.Fatalf("SECRET LEAKED IN CLI ARGS: found %q in %v", forbidden, args)
		}
	}

	joinedEnv := strings.Join(env, "\n")
	for _, expectedEnv := range []string{
		"KOPIA_PASSWORD=" + secrets.KopiaPassword,
		"KOPIA_SERVER_USERNAME=" + secrets.ServerUsername,
		"KOPIA_SERVER_PASSWORD=" + secrets.ServerPassword,
		"KOPIA_SERVER_CERT_FINGERPRINT=" + secrets.ServerCertFingerprint,
	} {
		if !strings.Contains(joinedEnv, expectedEnv) {
			t.Fatalf("expected %q in cmd.Env", expectedEnv)
		}
	}

	// Verify config/repository.config permissions (0600 on unix) and absence of secrets on disk.
	cfgBytes, err := os.ReadFile(cfgRes.ConfigFilePath)
	if err != nil {
		t.Fatalf("read repository.config: %v", err)
	}
	if strings.Contains(string(cfgBytes), secrets.KopiaPassword) || strings.Contains(string(cfgBytes), secrets.ServerPassword) {
		t.Fatalf("SECRET LEAKED ON DISK in repository.config")
	}
	if runtime.GOOS != "windows" {
		fi, err := os.Stat(cfgRes.ConfigFilePath)
		if err != nil {
			t.Fatalf("stat repository.config: %v", err)
		}
		if fi.Mode().Perm() != 0600 {
			t.Fatalf("expected 0600 permissions on repository.config, got %o", fi.Mode().Perm())
		}
	}

	// 4. Test PID lockfile write and stale PID reaping.
	if err := WritePIDLock(tmpDir, 999999); err != nil {
		t.Fatalf("WritePIDLock failed: %v", err)
	}
	reapedPID, _ := ReapStalePID(tmpDir)
	if reapedPID != 999999 {
		t.Fatalf("expected reapedPID=999999, got %d", reapedPID)
	}
	if _, err := os.Stat(PIDLockPath(tmpDir)); !os.IsNotExist(err) {
		t.Fatalf("expected backup.pid to be removed after ReapStalePID")
	}
}

func TestEndToEndDeduplicatedBackupVerifyAndRestore(t *testing.T) {
	ctx := context.Background()
	dataDir := t.TempDir()
	sourceDir := t.TempDir()
	restoreDir := t.TempDir()

	// Create test dataset with duplicate files and compressible content to verify real deduplication.
	repeatedBlock := bytes.Repeat([]byte("ApexVault-Immutable-Content-Defined-Chunk-Block-Payload-2026\n"), 4096)
	uniqueBlock := []byte("Unique-Customer-QuickBooks-Database-Header-Record-v1\n")

	fileA := filepath.Join(sourceDir, "accounting", "ledger-primary.qbw")
	fileB := filepath.Join(sourceDir, "accounting", "ledger-copy.qbw") // 100% identical to fileA
	fileC := filepath.Join(sourceDir, "configs", "pos-station.json")

	if err := os.MkdirAll(filepath.Dir(fileA), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(fileC), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(fileA, repeatedBlock, 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(fileB, repeatedBlock, 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(fileC, uniqueBlock, 0644); err != nil {
		t.Fatal(err)
	}

	eng := NewEngine(dataDir)
	_, err := eng.Configure(ctx, map[string]interface{}{
		"vaultId":          "vault-b2-01",
		"backendType":      "backblaze_b2",
		"b2BucketName":     "apexvault-immutable-prod",
		"b2KeyId":          "005keyid",
		"b2ApplicationKey": "K005SuperSecretB2AppKey",
		"kopiaPassword":    "RepoEncryptionPass#2026",
	})
	if err != nil {
		t.Fatalf("Configure B2 failed: %v", err)
	}

	runRes, err := eng.RunBackup(ctx, map[string]interface{}{
		"jobId":             "job-101",
		"policyId":          "pol-workstation-gold",
		"mode":              "volume_snapshot_vss",
		"includePaths":      []string{sourceDir},
		"enableWindowsVss":  true,
		"immutableLockDays": 30,
	})
	if err != nil {
		t.Fatalf("RunBackup failed: %v", err)
	}

	expectedLogical := int64(len(repeatedBlock)*2 + len(uniqueBlock))
	if runRes.LogicalBytes != expectedLogical {
		t.Fatalf("LogicalBytes = %d, want %d", runRes.LogicalBytes, expectedLogical)
	}
	if runRes.StoredDeduplicatedBytes <= 0 || runRes.StoredDeduplicatedBytes >= runRes.LogicalBytes {
		t.Fatalf("expected StoredDeduplicatedBytes (%d) < LogicalBytes (%d)", runRes.StoredDeduplicatedBytes, runRes.LogicalBytes)
	}
	if runRes.DedupRatio <= 1.0 || runRes.DedupSavingsPct <= 0 {
		t.Fatalf("expected DedupRatio > 1.0 and DedupSavingsPct > 0, got ratio=%.2f savings=%.1f%%", runRes.DedupRatio, runRes.DedupSavingsPct)
	}
	if runRes.FileCount != 3 {
		t.Fatalf("expected FileCount=3, got %d", runRes.FileCount)
	}
	if runRes.SHA256RootHash == "" {
		t.Fatalf("expected non-empty SHA256RootHash")
	}

	// Verify heartbeat report reflects updated metrics.
	report := eng.GetReport()
	if !report.KopiaInstalled || !report.KopiaSha256Verified || !report.RepositoryConnected {
		t.Fatalf("unexpected BackupAgentReport: %+v", report)
	}
	if report.LastSnapshotId != runRes.SnapshotID || report.LogicalBytesTotal != expectedLogical {
		t.Fatalf("report totals mismatch: %+v", report)
	}

	// Verify snapshots integrity.
	verRes, err := eng.VerifySnapshots(ctx, map[string]interface{}{
		"snapshotId":    runRes.SnapshotID,
		"verifyPercent": 100,
	})
	if err != nil {
		t.Fatalf("VerifySnapshots failed: %v", err)
	}
	if verRes.VerificationStatus != "verified_ok" || verRes.SnapshotsVerified != 1 || verRes.ChunksVerified != 2 {
		t.Fatalf("unexpected VerifySnapshots result: %+v", verRes)
	}

	// Restore snapshot to restoreDir and verify byte-for-byte identity.
	restRes, err := eng.RestoreSnapshot(ctx, map[string]interface{}{
		"snapshotId":        runRes.SnapshotID,
		"targetRestorePath": restoreDir,
	})
	if err != nil {
		t.Fatalf("RestoreSnapshot failed: %v", err)
	}
	if !restRes.SHA256Verified || restRes.FilesRestored != 3 || restRes.BytesRestored != expectedLogical {
		t.Fatalf("unexpected RestoreSnapshot result: %+v", restRes)
	}

	restoredA, err := os.ReadFile(filepath.Join(restoreDir, "accounting", "ledger-primary.qbw"))
	if err != nil || !bytes.Equal(restoredA, repeatedBlock) {
		t.Fatalf("restored ledger-primary.qbw content mismatch (err=%v)", err)
	}
	restoredC, err := os.ReadFile(filepath.Join(restoreDir, "configs", "pos-station.json"))
	if err != nil || !bytes.Equal(restoredC, uniqueBlock) {
		t.Fatalf("restored pos-station.json content mismatch (err=%v)", err)
	}
}

func TestVolumeSnapshotCrossPlatformFallback(t *testing.T) {
	ctx := context.Background()
	target := t.TempDir()

	for _, osName := range []string{"windows", "darwin", "linux"} {
		snap, err := CreateVolumeSnapshot(ctx, target, SnapshotOptions{
			Mode:               "volume_snapshot_vss",
			EnableWindowsVSS:   true,
			EnableAPFSSnapshot: true,
			EnableLVMSnapshot:  true,
			OSOverride:         osName,
		})
		if err != nil {
			t.Fatalf("CreateVolumeSnapshot(%s) returned error: %v", osName, err)
		}
		if snap == nil || snap.ShadowPath == "" {
			t.Fatalf("CreateVolumeSnapshot(%s) returned empty ShadowPath", osName)
		}
		if err := snap.Cleanup(); err != nil {
			t.Fatalf("snap.Cleanup(%s) failed: %v", osName, err)
		}
		if !snap.CleanedUp {
			t.Fatalf("expected snap.CleanedUp=true after Cleanup()")
		}
	}
}

func TestBareMetalCaptureAndRecoveryPairing(t *testing.T) {
	ctx := context.Background()
	sampleDir := t.TempDir()
	sampleImg := filepath.Join(sampleDir, "boot-sector.bin")
	if err := os.WriteFile(sampleImg, bytes.Repeat([]byte{0xEB, 0x3C, 0x90, 0x4D, 0x53, 0x44, 0x4F, 0x53}, 1024), 0644); err != nil {
		t.Fatal(err)
	}

	bm, err := CaptureBareMetalMetadata(ctx, sampleDir)
	if err != nil {
		t.Fatalf("CaptureBareMetalMetadata failed: %v", err)
	}
	if bm.BootloaderType != "uefi_gpt" && bm.BootloaderType != "bios_mbr" {
		t.Fatalf("unexpected BootloaderType: %s", bm.BootloaderType)
	}
	if len(bm.Partitions) == 0 || bm.PartitionLayoutSummary == "" {
		t.Fatalf("expected non-empty Partitions and PartitionLayoutSummary: %+v", bm)
	}
	if len(bm.BlockChunks) < 2 || bm.SHA256RootHash == "" {
		t.Fatalf("expected block chunks and SHA256RootHash, got %+v", bm)
	}

	recRes, err := RunRecoveryMode(ctx, "", "849201")
	if err != nil {
		t.Fatalf("RunRecoveryMode failed: %v", err)
	}
	if recRes.PairingCode != "849201" || recRes.Status != "completed" || recRes.TargetDisksDetected < 1 {
		t.Fatalf("unexpected RecoverySessionResult: %+v", recRes)
	}
}
