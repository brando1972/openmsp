package security

import (
	"context"
	"crypto/rand"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// TestAcceptance2_EICARDetection verifies that the bounded scanner reliably detects
// the standard EICAR test string and reports ruleId=APEX-AV-EICAR-001 with confidence=1.0.
func TestAcceptance2_EICARDetection(t *testing.T) {
	tmpDir := t.TempDir()
	eicarPath := filepath.Join(tmpDir, "eicar_test.com")
	if err := os.WriteFile(eicarPath, []byte(EICARStandardSignature), 0600); err != nil {
		t.Fatalf("write eicar file: %v", err)
	}

	benignPath := filepath.Join(tmpDir, "benign_notes.txt")
	if err := os.WriteFile(benignPath, []byte("Normal quarterly IT operations note.\n"), 0600); err != nil {
		t.Fatalf("write benign file: %v", err)
	}

	res, err := ScanPath(context.Background(), ScanOptions{
		TargetPath: tmpDir,
	})
	if err != nil {
		t.Fatalf("ScanPath error: %v", err)
	}

	if res.ScannedFiles != 2 {
		t.Fatalf("expected 2 scanned files, got %d", res.ScannedFiles)
	}
	if len(res.Detections) != 1 {
		t.Fatalf("expected exactly 1 detection for EICAR, got %d", len(res.Detections))
	}

	det := res.Detections[0]
	if det.RuleID != "APEX-AV-EICAR-001" {
		t.Errorf("expected RuleID APEX-AV-EICAR-001, got %s", det.RuleID)
	}
	if det.File == nil || det.File.SHA256 != EICARStandardSHA256 {
		t.Errorf("expected EICAR SHA256 %s, got %+v", EICARStandardSHA256, det.File)
	}
	if det.Confidence != 1.0 {
		t.Errorf("expected Confidence 1.0, got %f", det.Confidence)
	}
}

// TestAcceptance8_RansomwareRecoveryInhibitionAndBackupExclusion verifies that destructive
// recovery-inhibition commands are caught while legitimate backup software (Veeam, Acronis, Datto)
// in verified paths is excluded, and spoofed backup binaries in untrusted paths are still caught.
func TestAcceptance8_RansomwareRecoveryInhibitionAndBackupExclusion(t *testing.T) {
	maliciousCases := []struct {
		name       string
		proc       ProcessInfo
		wantRuleID string
	}{
		{
			name: "vssadmin delete shadows",
			proc: ProcessInfo{
				PID:        4120,
				PPID:       3000,
				Name:       "vssadmin.exe",
				ExePath:    `C:\Windows\System32\vssadmin.exe`,
				Cmdline:    `vssadmin.exe delete shadows /all /quiet`,
				ParentName: "cmd.exe",
			},
			wantRuleID: "APEX-EDR-RI-001",
		},
		{
			name: "vssadmin resize shadowstorage",
			proc: ProcessInfo{
				PID:     4121,
				Name:    "vssadmin.exe",
				Cmdline: `vssadmin resize shadowstorage /for=c: /on=c: /maxsize=401MB`,
			},
			wantRuleID: "APEX-EDR-RI-001",
		},
		{
			name: "wmic shadowcopy delete",
			proc: ProcessInfo{
				PID:     4122,
				Name:    "wmic.exe",
				Cmdline: `wmic shadowcopy delete /nointeractive`,
			},
			wantRuleID: "APEX-EDR-RI-002",
		},
		{
			name: "wbadmin delete catalog",
			proc: ProcessInfo{
				PID:     4123,
				Name:    "wbadmin.exe",
				Cmdline: `wbadmin delete catalog -quiet`,
			},
			wantRuleID: "APEX-EDR-RI-003",
		},
		{
			name: "bcdedit recoveryenabled no",
			proc: ProcessInfo{
				PID:     4124,
				Name:    "bcdedit.exe",
				Cmdline: `bcdedit /set {default} recoveryenabled no`,
			},
			wantRuleID: "APEX-EDR-RI-004",
		},
		{
			name: "cipher free space wipe",
			proc: ProcessInfo{
				PID:     4125,
				Name:    "cipher.exe",
				Cmdline: `cipher /w:C:\`,
			},
			wantRuleID: "APEX-EDR-RI-005",
		},
		{
			name: "encoded powershell cradle",
			proc: ProcessInfo{
				PID:     4126,
				Name:    "powershell.exe",
				Cmdline: `powershell.exe -NoP -NonI -W Hidden -EncodedCommand SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQA`,
			},
			wantRuleID: "APEX-EDR-PS-001",
		},
		{
			name: "spoofed VeeamAgent in C:\\Users\\Public MUST NOT be excluded",
			proc: ProcessInfo{
				PID:           4999,
				Name:          "vssadmin.exe",
				ExePath:       `C:\Windows\System32\vssadmin.exe`,
				Cmdline:       `vssadmin delete shadows /all /quiet`,
				ParentName:    "VeeamAgent.exe",
				ParentExePath: `C:\Users\Public\Downloads\VeeamAgent.exe`,
			},
			wantRuleID: "APEX-EDR-RI-001",
		},
	}

	for _, tc := range maliciousCases {
		t.Run(tc.name, func(t *testing.T) {
			det := AnalyzeCommandLine(tc.proc)
			if det == nil {
				t.Fatalf("expected detection %s for %q, got nil", tc.wantRuleID, tc.proc.Cmdline)
			}
			if det.RuleID != tc.wantRuleID {
				t.Errorf("expected RuleID %s, got %s", tc.wantRuleID, det.RuleID)
			}
		})
	}

	legitimateBackupCases := []ProcessInfo{
		{
			PID:           5100,
			Name:          "vssadmin.exe",
			ExePath:       `C:\Windows\System32\vssadmin.exe`,
			Cmdline:       `vssadmin resize shadowstorage /for=C: /on=C: /maxsize=20%`,
			ParentName:    "VeeamAgent.exe",
			ParentExePath: `C:\Program Files\Veeam\Endpoint Backup\VeeamAgent.exe`,
		},
		{
			PID:           5101,
			Name:          "vssadmin.exe",
			ExePath:       `C:\Windows\System32\vssadmin.exe`,
			Cmdline:       `vssadmin delete shadows /for=C: /oldest /quiet`,
			ParentName:    "mms.exe",
			ParentExePath: `C:\Program Files\Acronis\BackupAndRecovery\mms.exe`,
		},
		{
			PID:           5102,
			Name:          "vssadmin.exe",
			ExePath:       `C:\Windows\System32\vssadmin.exe`,
			Cmdline:       `vssadmin delete shadows /for=C: /oldest /quiet`,
			ParentName:    "DattoBackupAgent.exe",
			ParentExePath: `C:\Program Files\Datto\Datto Windows Agent\DattoBackupAgent.exe`,
		},
		{
			PID:           5103,
			Name:          "wbadmin.exe",
			ExePath:       `C:\Windows\System32\wbadmin.exe`,
			Cmdline:       `wbadmin delete systemstatebackup -keepVersions:3 --scheduled-maintenance`,
			ParentName:    "wbengine.exe",
			ParentExePath: `C:\Windows\System32\wbengine.exe`,
		},
	}

	for _, leg := range legitimateBackupCases {
		if det := AnalyzeCommandLine(leg); det != nil {
			t.Errorf("expected legitimate backup process (parent=%s, path=%s) to be excluded, but got detection: %+v",
				leg.ParentName, leg.ParentExePath, det)
		}
	}
}

// TestCanaryTripwireLifecycle verifies canary deployment, baseline integrity check,
// high-entropy encryption tamper detection, rename (.locked) detection, and clean restoration.
func TestCanaryTripwireLifecycle(t *testing.T) {
	canaryDir := filepath.Join(t.TempDir(), "canary")

	paths, err := EnsureCanaryFiles(canaryDir)
	if err != nil {
		t.Fatalf("EnsureCanaryFiles failed: %v", err)
	}
	if len(paths) != 3 {
		t.Fatalf("expected 3 canary files, got %d", len(paths))
	}

	// 1. Intact verification
	dets, intact, verifiedPaths := CheckCanaryFiles(canaryDir)
	if !intact || len(dets) != 0 || len(verifiedPaths) != 3 {
		t.Fatalf("expected intact canaries with 0 detections, got intact=%v dets=%d", intact, len(dets))
	}

	// 2. High-entropy overwrite (simulated encryption) on first canary
	randomBytes := make([]byte, 4096)
	_, _ = rand.Read(randomBytes)
	if err := os.WriteFile(paths[0], randomBytes, 0600); err != nil {
		t.Fatalf("overwrite canary with high entropy: %v", err)
	}

	dets, intact, _ = CheckCanaryFiles(canaryDir)
	if intact || len(dets) == 0 {
		t.Fatalf("expected canary tamper detection after high-entropy overwrite")
	}
	if dets[0].RuleID != "APEX-EDR-CANARY-ENC" {
		t.Errorf("expected high-entropy RuleID APEX-EDR-CANARY-ENC, got %s", dets[0].RuleID)
	}

	// 3. Rename second canary to .locked
	lockedPath := paths[1] + ".locked"
	if err := os.Rename(paths[1], lockedPath); err != nil {
		t.Fatalf("rename canary to .locked: %v", err)
	}

	dets, intact, _ = CheckCanaryFiles(canaryDir)
	if intact || len(dets) < 2 {
		t.Fatalf("expected at least 2 canary detections (modified + renamed), got %d", len(dets))
	}

	// 4. Restore canaries and verify clean state
	if _, err := RestoreCanaryFiles(canaryDir); err != nil {
		t.Fatalf("RestoreCanaryFiles failed: %v", err)
	}
	dets, intact, _ = CheckCanaryFiles(canaryDir)
	if !intact || len(dets) != 0 {
		t.Fatalf("expected restored canaries to be intact with 0 detections, got intact=%v dets=%d", intact, len(dets))
	}
}

// TestAcceptance11_QuarantineAndSHA256VerifiedRestore verifies safe quarantine isolation
// (0000 permissions, manifest creation, original deletion) and cryptographic SHA-256 verified restore.
func TestAcceptance11_QuarantineAndSHA256VerifiedRestore(t *testing.T) {
	workDir := t.TempDir()
	quarDir := filepath.Join(workDir, "quarantine")
	suspectFile := filepath.Join(workDir, "dropper_sim.bin")

	originalPayload := []byte(EICARStandardSignature)
	if err := os.WriteFile(suspectFile, originalPayload, 0640); err != nil {
		t.Fatalf("write suspect file: %v", err)
	}

	manifest, err := QuarantineFile(suspectFile, quarDir, "Unit test EICAR containment")
	if err != nil {
		t.Fatalf("QuarantineFile failed: %v", err)
	}

	// Original file must no longer exist
	if _, err := os.Stat(suspectFile); !os.IsNotExist(err) {
		t.Fatalf("expected original file %s to be removed after quarantine", suspectFile)
	}

	// Quarantined file must exist with 0000 permissions
	qInfo, err := os.Stat(manifest.QuarantinePath)
	if err != nil {
		t.Fatalf("stat quarantined file: %v", err)
	}
	if qInfo.Mode().Perm() != 0000 {
		t.Errorf("expected quarantined file mode 0000, got %o", qInfo.Mode().Perm())
	}

	// Restore and verify SHA-256 integrity
	restoredManifest, err := RestoreQuarantinedFile(manifest.SHA256, quarDir, "")
	if err != nil {
		t.Fatalf("RestoreQuarantinedFile failed: %v", err)
	}
	if restoredManifest.SHA256 != EICARStandardSHA256 {
		t.Errorf("expected restored SHA256 %s, got %s", EICARStandardSHA256, restoredManifest.SHA256)
	}

	restoredBytes, err := os.ReadFile(suspectFile)
	if err != nil {
		t.Fatalf("read restored file: %v", err)
	}
	if string(restoredBytes) != string(originalPayload) {
		t.Errorf("restored payload content mismatch")
	}

	// Also verify that corrupting a quarantined payload causes RestoreQuarantinedFile to fail closed
	manifest2, err := QuarantineFile(suspectFile, quarDir, "Second quarantine for tamper test")
	if err != nil {
		t.Fatalf("second QuarantineFile failed: %v", err)
	}
	_ = os.Chmod(manifest2.QuarantinePath, 0600)
	_ = os.WriteFile(manifest2.QuarantinePath, []byte("corrupted-bytes"), 0000)

	if _, err := RestoreQuarantinedFile(manifest2.SHA256, quarDir, ""); err == nil {
		t.Fatalf("expected RestoreQuarantinedFile to fail when quarantined payload SHA-256 is corrupted")
	}
}

// TestAcceptance10_BoundedScannerLimits verifies that files larger than MaxFileSizeBytes are skipped
// and that scan timeouts terminate execution cleanly without hanging.
func TestAcceptance10_BoundedScannerLimits(t *testing.T) {
	tmpDir := t.TempDir()

	smallFile := filepath.Join(tmpDir, "small_eicar.txt")
	_ = os.WriteFile(smallFile, []byte(EICARStandardSignature), 0600)

	largeFile := filepath.Join(tmpDir, "oversized.bin")
	// Write a 2KB file and set MaxFileSizeBytes=1024 to test oversized skip without wasting disk I/O
	oversizedData := make([]byte, 2048)
	_ = os.WriteFile(largeFile, oversizedData, 0600)

	res, err := ScanPath(context.Background(), ScanOptions{
		TargetPath:       tmpDir,
		MaxFileSizeBytes: 1024,
		Timeout:          5 * time.Second,
	})
	if err != nil {
		t.Fatalf("ScanPath failed: %v", err)
	}
	if res.SkippedLargeFiles != 1 {
		t.Errorf("expected 1 skipped large file, got %d", res.SkippedLargeFiles)
	}
	if len(res.Detections) != 1 {
		t.Errorf("expected 1 detection from small_eicar.txt, got %d", len(res.Detections))
	}

	// Verify timeout enforcement with PerFileDelay > Timeout
	timeoutRes, err := ScanPath(context.Background(), ScanOptions{
		TargetPath:   tmpDir,
		Timeout:      25 * time.Millisecond,
		PerFileDelay: 80 * time.Millisecond,
	})
	if err != nil {
		t.Fatalf("ScanPath timeout test returned unexpected error: %v", err)
	}
	if !timeoutRes.TimedOut {
		t.Errorf("expected TimedOut=true when PerFileDelay exceeds Timeout")
	}
}

// TestLivePostureCollectionAndIsolationState verifies that CollectPosture inspects OS posture
// without disabling native AV and accurately reflects host isolation state.
func TestLivePostureCollectionAndIsolationState(t *testing.T) {
	SetIsolated(false)
	posture := CollectPosture()
	if posture == nil {
		t.Fatalf("expected non-nil SecurityPostureReport")
	}
	if posture.PreventiveAvName == "" {
		t.Errorf("expected non-empty PreventiveAvName")
	}
	if !posture.RecoveryInhibitionGuardActive {
		t.Errorf("expected RecoveryInhibitionGuardActive=true")
	}
	if len(posture.Sensors) == 0 {
		t.Errorf("expected at least 1 sensor in SecurityPostureReport")
	}

	SetIsolated(true)
	defer SetIsolated(false)
	isoPosture := CollectPosture()
	if !isoPosture.Isolated || isoPosture.CoverageState != "containment_verified" {
		t.Errorf("expected Isolated=true and CoverageState=containment_verified, got Isolated=%v CoverageState=%s",
			isoPosture.Isolated, isoPosture.CoverageState)
	}
}

// TestShuffleOrborusAndCortexAnalyzers verifies all 5 native Go Shuffle SOAR & Cortex Analyzer actions
// (cortex_analyze_file_hash, cortex_analyze_process_cmdline, shuffle_reseed_canaries,
// shuffle_quarantine_and_verify, and shuffle_protected_asset_check).
func TestShuffleOrborusAndCortexAnalyzers(t *testing.T) {
	ctx := context.Background()
	tmpDir := t.TempDir()

	// 1. cortex_analyze_file_hash on EICAR file
	eicarFile := filepath.Join(tmpDir, "eicar_cortex.com")
	if err := os.WriteFile(eicarFile, []byte(EICARStandardSignature), 0600); err != nil {
		t.Fatalf("write eicar file: %v", err)
	}

	step1 := ShuffleWorkflowStep{
		ExecutionID: "exec-001",
		WorkflowID:  "wf-cortex-file",
		StepID:      "step-1",
		AppName:     "ApexCortexAnalyzer",
		Action:      "cortex_analyze_file_hash",
		Parameters: map[string]interface{}{
			"filePath": eicarFile,
			"tlp":      2,
			"pap":      2,
		},
	}
	res1 := ExecuteShufflePlaybookStep(ctx, step1)
	if !res1.Success || res1.Status != "FINISHED" || res1.ObservableResult == nil {
		t.Fatalf("step1 failed: %+v", res1)
	}
	if len(res1.ObservableResult.Taxonomies) != 1 || res1.ObservableResult.Taxonomies[0].Level != "malicious" {
		t.Errorf("expected Cortex taxonomy level=malicious, got %+v", res1.ObservableResult.Taxonomies)
	}
	if res1.Output["sha256"] != EICARStandardSHA256 {
		t.Errorf("expected SHA256 %s, got %v", EICARStandardSHA256, res1.Output["sha256"])
	}

	// 2. cortex_analyze_process_cmdline on malicious vssadmin AND legitimate Veeam backup exclusion
	step2Mal := ShuffleWorkflowStep{
		ExecutionID: "exec-002",
		WorkflowID:  "wf-cortex-proc",
		StepID:      "step-2a",
		AppName:     "ApexCortexAnalyzer",
		Action:      "cortex_analyze_process_cmdline",
		Parameters: map[string]interface{}{
			"pid":     6001,
			"name":    "vssadmin.exe",
			"cmdline": "vssadmin.exe delete shadows /all /quiet",
		},
	}
	res2Mal := ExecuteShufflePlaybookStep(ctx, step2Mal)
	if !res2Mal.Success || res2Mal.ObservableResult == nil {
		t.Fatalf("step2Mal failed: %+v", res2Mal)
	}
	if res2Mal.ObservableResult.Taxonomies[0].Level != "malicious" {
		t.Errorf("expected malicious taxonomy for vssadmin delete shadows, got %+v", res2Mal.ObservableResult.Taxonomies[0])
	}
	if len(res2Mal.ObservableResult.MitreAttackTags) == 0 || res2Mal.ObservableResult.MitreAttackTags[0] != "T1490" {
		t.Errorf("expected MITRE tag T1490, got %v", res2Mal.ObservableResult.MitreAttackTags)
	}

	step2Safe := ShuffleWorkflowStep{
		ExecutionID: "exec-002",
		WorkflowID:  "wf-cortex-proc",
		StepID:      "step-2b",
		AppName:     "ApexCortexAnalyzer",
		Action:      "cortex_analyze_process_cmdline",
		Parameters: map[string]interface{}{
			"pid":           6002,
			"name":          "vssadmin.exe",
			"cmdline":       "vssadmin resize shadowstorage /for=C: /on=C: /maxsize=20%",
			"parentName":    "VeeamAgent.exe",
			"parentExePath": `C:\Program Files\Veeam\Endpoint Backup\VeeamAgent.exe`,
		},
	}
	res2Safe := ExecuteShufflePlaybookStep(ctx, step2Safe)
	if !res2Safe.Success || res2Safe.ObservableResult == nil || res2Safe.ObservableResult.Taxonomies[0].Level != "safe" {
		t.Errorf("expected safe taxonomy for verified Veeam parent, got %+v", res2Safe)
	}

	// 3. shuffle_reseed_canaries
	canaryDir := filepath.Join(tmpDir, "canaries")
	step3 := ShuffleWorkflowStep{
		ExecutionID: "exec-003",
		WorkflowID:  "wf-soar-canary",
		StepID:      "step-3",
		AppName:     "ApexEndpointSOAR",
		Action:      "shuffle_reseed_canaries",
		Parameters: map[string]interface{}{
			"canaryDir": canaryDir,
		},
	}
	res3 := ExecuteShufflePlaybookStep(ctx, step3)
	if !res3.Success || res3.Output["intact"] != true {
		t.Fatalf("shuffle_reseed_canaries failed: %+v", res3)
	}

	// 4. shuffle_quarantine_and_verify
	quarDir := filepath.Join(tmpDir, "quarantine")
	step4 := ShuffleWorkflowStep{
		ExecutionID: "exec-004",
		WorkflowID:  "wf-soar-quarantine",
		StepID:      "step-4",
		AppName:     "ApexEndpointSOAR",
		Action:      "shuffle_quarantine_and_verify",
		Parameters: map[string]interface{}{
			"filePath":      eicarFile,
			"quarantineDir": quarDir,
			"reason":        "Shuffle automated containment",
		},
	}
	res4 := ExecuteShufflePlaybookStep(ctx, step4)
	if !res4.Success || res4.Output["verified"] != true {
		t.Fatalf("shuffle_quarantine_and_verify failed: %+v", res4)
	}

	// 5. shuffle_protected_asset_check (POS VLAN 88 & PAX terminal blocked without human approval; standard workstation allowed)
	step5Blocked := ShuffleWorkflowStep{
		ExecutionID: "exec-005",
		WorkflowID:  "wf-soar-guard",
		StepID:      "step-5a",
		AppName:     "ApexEndpointSOAR",
		Action:      "shuffle_protected_asset_check",
		Parameters: map[string]interface{}{
			"ip":                  "10.88.0.45",
			"mac":                 "00:1d:ea:aa:bb:cc",
			"vlanId":              88,
			"assetCriticality":    "pos_payment",
			"switchPortHostCount": 4,
			"humanApproved":       "false",
		},
	}
	res5Blocked := ExecuteShufflePlaybookStep(ctx, step5Blocked)
	if res5Blocked.Status != "BLOCKED_PROTECTED_ASSET" || res5Blocked.Output["autoContainmentAllowed"] != false {
		t.Errorf("expected BLOCKED_PROTECTED_ASSET for POS VLAN 88 / PAX terminal, got %+v", res5Blocked)
	}

	step5Allowed := ShuffleWorkflowStep{
		ExecutionID: "exec-005",
		WorkflowID:  "wf-soar-guard",
		StepID:      "step-5b",
		AppName:     "ApexEndpointSOAR",
		Action:      "shuffle_protected_asset_check",
		Parameters: map[string]interface{}{
			"ip":                  "10.20.1.55",
			"mac":                 "a4:83:e7:11:22:33",
			"vlanId":              20,
			"assetCriticality":    "standard",
			"switchPortHostCount": 1,
		},
	}
	res5Allowed := ExecuteShufflePlaybookStep(ctx, step5Allowed)
	if res5Allowed.Status != "FINISHED" || res5Allowed.Output["autoContainmentAllowed"] != true {
		t.Errorf("expected autoContainmentAllowed=true for standard workstation on single-host port, got %+v", res5Allowed)
	}
}


