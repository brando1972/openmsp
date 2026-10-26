package security

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// CortexTaxonomyReport represents a TheHive/Cortex-compatible mini-report taxonomy badge
// (e.g., namespace="ApexCortex", predicate="MalwareScan", value="EICAR-Test-File", level="malicious").
type CortexTaxonomyReport struct {
	Level     string `json:"level"`     // "malicious" | "suspicious" | "safe" | "info"
	Namespace string `json:"namespace"` // e.g. "ApexCortex", "ApexEDR", "ApexGuard"
	Predicate string `json:"predicate"` // e.g. "FileAnalysis", "ProcessReflex", "AssetGuard"
	Value     string `json:"value"`
	TLP       int    `json:"tlp"` // 0=WHITE/CLEAR, 1=GREEN, 2=AMBER, 3=RED
	PAP       int    `json:"pap"` // 0=WHITE/CLEAR, 1=GREEN, 2=AMBER, 3=RED
}

// CortexObservableResult encapsulates the full Cortex Analyzer output for a file, hash, process, or host observable.
type CortexObservableResult struct {
	ObservableType  string                 `json:"observableType"`  // "file" | "hash" | "process" | "host" | "network"
	ObservableValue string                 `json:"observableValue"` // path, sha256, cmdline, ip/mac
	Success         bool                   `json:"success"`
	Summary         string                 `json:"summary"`
	Taxonomies      []CortexTaxonomyReport `json:"taxonomies"`
	MitreAttackTags []string               `json:"mitreAttackTags,omitempty"`
	Artifacts       map[string]interface{} `json:"artifacts,omitempty"`
	AnalyzedAt      string                 `json:"analyzedAt"`
}

// ShuffleWorkflowStep represents a single step dispatched to the Shuffle Orborus-compatible Go worker.
type ShuffleWorkflowStep struct {
	ExecutionID string                 `json:"executionId"`
	WorkflowID  string                 `json:"workflowId"`
	StepID      string                 `json:"stepId"`
	AppName     string                 `json:"appName"` // e.g. "ApexCortexAnalyzer" | "ApexEndpointSOAR"
	Action      string                 `json:"action"`  // "cortex_analyze_file_hash" | "cortex_analyze_process_cmdline" | "shuffle_reseed_canaries" | "shuffle_quarantine_and_verify" | "shuffle_protected_asset_check"
	Parameters  map[string]interface{} `json:"parameters"`
}

// ShuffleExecutionRequest represents a single-step or multi-step Shuffle Orborus playbook payload.
type ShuffleExecutionRequest struct {
	ExecutionID string                `json:"executionId"`
	WorkflowID  string                `json:"workflowId"`
	Step        *ShuffleWorkflowStep  `json:"step,omitempty"`
	Steps       []ShuffleWorkflowStep `json:"steps,omitempty"`
}

// ShuffleExecutionResult is the structured Orborus worker response returned by a playbook step.
type ShuffleExecutionResult struct {
	ExecutionID      string                  `json:"executionId"`
	WorkflowID       string                  `json:"workflowId"`
	StepID           string                  `json:"stepId"`
	Action           string                  `json:"action"`
	Status           string                  `json:"status"` // "FINISHED" | "FAILURE" | "BLOCKED_PROTECTED_ASSET" | "SKIPPED"
	Success          bool                    `json:"success"`
	Message          string                  `json:"message"`
	ObservableResult *CortexObservableResult `json:"observableResult,omitempty"`
	Output           map[string]interface{}  `json:"output,omitempty"`
	DurationMs       int64                   `json:"durationMs"`
	CompletedAt      string                  `json:"completedAt"`
}

// ExecuteShufflePlaybook executes one or more Shuffle workflow steps sequentially on the endpoint worker.
func ExecuteShufflePlaybook(ctx context.Context, req ShuffleExecutionRequest) []ShuffleExecutionResult {
	var steps []ShuffleWorkflowStep
	if req.Step != nil {
		s := *req.Step
		if s.ExecutionID == "" {
			s.ExecutionID = req.ExecutionID
		}
		if s.WorkflowID == "" {
			s.WorkflowID = req.WorkflowID
		}
		steps = append(steps, s)
	}
	for _, s := range req.Steps {
		if s.ExecutionID == "" {
			s.ExecutionID = req.ExecutionID
		}
		if s.WorkflowID == "" {
			s.WorkflowID = req.WorkflowID
		}
		steps = append(steps, s)
	}

	results := make([]ShuffleExecutionResult, 0, len(steps))
	for _, step := range steps {
		res := ExecuteShufflePlaybookStep(ctx, step)
		results = append(results, res)
	}
	return results
}

// ExecuteShufflePlaybookStep executes a single Shuffle Orborus / Cortex Analyzer action natively in Go
// without requiring Docker-in-Docker container spawning on the endpoint.
func ExecuteShufflePlaybookStep(ctx context.Context, step ShuffleWorkflowStep) ShuffleExecutionResult {
	start := time.Now()
	nowStr := start.UTC().Format(time.RFC3339)

	res := ShuffleExecutionResult{
		ExecutionID: step.ExecutionID,
		WorkflowID:  step.WorkflowID,
		StepID:      step.StepID,
		Action:      step.Action,
		Status:      "FINISHED",
		Success:     true,
		Output:      make(map[string]interface{}),
		CompletedAt: nowStr,
	}

	switch strings.ToLower(strings.TrimSpace(step.Action)) {
	case "cortex_analyze_file_hash":
		runCortexAnalyzeFileHash(ctx, step.Parameters, &res)
	case "cortex_analyze_process_cmdline":
		runCortexAnalyzeProcessCmdline(step.Parameters, &res)
	case "shuffle_reseed_canaries":
		runShuffleReseedCanaries(step.Parameters, &res)
	case "shuffle_quarantine_and_verify":
		runShuffleQuarantineAndVerify(step.Parameters, &res)
	case "shuffle_protected_asset_check":
		runShuffleProtectedAssetCheck(step.Parameters, &res)
	default:
		res.Status = "FAILURE"
		res.Success = false
		res.Message = fmt.Sprintf("unsupported Shuffle/Cortex action: %q", step.Action)
	}

	res.DurationMs = time.Since(start).Milliseconds()
	res.CompletedAt = time.Now().UTC().Format(time.RFC3339)
	return res
}

// 1. cortex_analyze_file_hash: Hashes file or buffer (or inspects provided SHA-256),
// checks EICAR / ransomware markers / YARA-X / ClamAV, and returns a Cortex Taxonomy report.
func runCortexAnalyzeFileHash(ctx context.Context, params map[string]interface{}, res *ShuffleExecutionResult) {
	filePath := paramStr(params, "filePath", "path", "targetPath")
	providedHash := strings.ToLower(paramStr(params, "sha256", "hash"))
	inlineContent := paramStr(params, "content", "buffer")
	tlp := paramIntDefault(params, "tlp", 2) // default TLP:AMBER
	pap := paramIntDefault(params, "pap", 2) // default PAP:AMBER

	var computedHash string
	var matchedRuleID string
	var matchedRuleName string
	var matchedCategory string
	var level = "safe"
	var mitreTags []string
	artifacts := make(map[string]interface{})

	if filePath != "" {
		scanRes, err := ScanPath(ctx, ScanOptions{
			TargetPath:    filePath,
			YaraRulesPath: paramStr(params, "yaraRulesPath"),
			EnableYaraX:   true,
			EnableClamAV:  true,
		})
		if err != nil {
			res.Status = "FAILURE"
			res.Success = false
			res.Message = fmt.Sprintf("cortex_analyze_file_hash scan failed: %v", err)
			return
		}
		if data, err := os.ReadFile(filePath); err == nil {
			sum := sha256.Sum256(data)
			computedHash = hex.EncodeToString(sum[:])
			artifacts["sizeBytes"] = len(data)
			artifacts["shannonEntropy"] = CalculateShannonEntropy(data)
		}
		if len(scanRes.Detections) > 0 {
			d := scanRes.Detections[0]
			level = "malicious"
			matchedRuleID = d.RuleID
			matchedRuleName = d.RuleName
			matchedCategory = d.Category
			if d.File != nil && d.File.SHA256 != "" {
				computedHash = d.File.SHA256
			}
			if d.Category == "ransomware" {
				mitreTags = append(mitreTags, "T1486")
			} else {
				mitreTags = append(mitreTags, "T1204.002")
			}
			EnqueueDetection(d)
		}
	} else if inlineContent != "" {
		data := []byte(inlineContent)
		sum := sha256.Sum256(data)
		computedHash = hex.EncodeToString(sum[:])
		artifacts["sizeBytes"] = len(data)
		artifacts["shannonEntropy"] = CalculateShannonEntropy(data)

		if strings.Contains(inlineContent, EICARStandardSignature) ||
			strings.Contains(inlineContent, EICARAltSignature) ||
			strings.Contains(inlineContent, "EICAR-STANDARD-ANTIVIRUS-TEST-FILE") ||
			computedHash == EICARStandardSHA256 || computedHash == EICARAltSHA256 {
			level = "malicious"
			matchedRuleID = "APEX-AV-EICAR-001"
			matchedRuleName = "EICAR Standard Antivirus Test File"
			matchedCategory = "malware"
		} else if strings.Contains(inlineContent, "APEXMSP-RANSOMWARE-SIMULATION-ARTIFACT") {
			level = "malicious"
			matchedRuleID = "APEX-YARA-RANSOM-SIM"
			matchedRuleName = "ApexMSP Benign Ransomware Simulation Artifact"
			matchedCategory = "ransomware"
			mitreTags = append(mitreTags, "T1486")
		}
	} else if providedHash != "" {
		computedHash = providedHash
		if sig, ok := defaultBlockedSHA256[providedHash]; ok {
			level = "malicious"
			matchedRuleID = "APEX-AV-HASH-001"
			matchedRuleName = sig
			matchedCategory = "malware"
		}
	} else {
		res.Status = "FAILURE"
		res.Success = false
		res.Message = "cortex_analyze_file_hash requires 'filePath', 'content', or 'sha256' parameter"
		return
	}

	artifacts["sha256"] = computedHash
	if filePath != "" {
		artifacts["filePath"] = filePath
	}

	predValue := "Clean / No Known Threats"
	if level == "malicious" {
		predValue = fmt.Sprintf("%s (%s)", matchedRuleName, matchedRuleID)
	}

	tax := CortexTaxonomyReport{
		Level:     level,
		Namespace: "ApexCortex",
		Predicate: "FileAnalysis",
		Value:     predValue,
		TLP:       tlp,
		PAP:       pap,
	}

	obsVal := filePath
	obsType := "file"
	if obsVal == "" {
		obsVal = computedHash
		obsType = "hash"
	}

	res.ObservableResult = &CortexObservableResult{
		ObservableType:  obsType,
		ObservableValue: obsVal,
		Success:         true,
		Summary:         fmt.Sprintf("Cortex File/Hash Analysis: level=%s sha256=%s (%s)", level, computedHash, predValue),
		Taxonomies:      []CortexTaxonomyReport{tax},
		MitreAttackTags: mitreTags,
		Artifacts:       artifacts,
		AnalyzedAt:      time.Now().UTC().Format(time.RFC3339),
	}
	res.Message = res.ObservableResult.Summary
	res.Output["sha256"] = computedHash
	res.Output["level"] = level
	res.Output["ruleId"] = matchedRuleID
	res.Output["category"] = matchedCategory
}

// 2. cortex_analyze_process_cmdline: Runs edr_reflex inspection on command line + parent path,
// returning a Cortex Taxonomy report + MITRE ATT&CK tags (and honoring verified backup exclusions).
func runCortexAnalyzeProcessCmdline(params map[string]interface{}, res *ShuffleExecutionResult) {
	cmdline := paramStr(params, "cmdline", "commandLine", "command")
	if cmdline == "" {
		res.Status = "FAILURE"
		res.Success = false
		res.Message = "cortex_analyze_process_cmdline requires a non-empty 'cmdline' parameter"
		return
	}

	proc := ProcessInfo{
		PID:           paramIntDefault(params, "pid", 0),
		PPID:          paramIntDefault(params, "ppid", 0),
		Name:          paramStr(params, "name", "processName", "exeName"),
		ExePath:       paramStr(params, "exePath", "executablePath"),
		Cmdline:       cmdline,
		User:          paramStr(params, "user", "username"),
		ParentName:    paramStr(params, "parentName", "parentProcessName"),
		ParentExePath: paramStr(params, "parentExePath", "parentExecutablePath"),
		Signer:        paramStr(params, "signer"),
	}
	if proc.Name == "" {
		fields := strings.Fields(cmdline)
		if len(fields) > 0 {
			proc.Name = filepath.Base(fields[0])
		}
	}

	tlp := paramIntDefault(params, "tlp", 2)
	pap := paramIntDefault(params, "pap", 2)

	// First check if excluded as a verified legitimate backup tool
	if excluded, vendor := IsExcludedBackupTool(proc); excluded {
		tax := CortexTaxonomyReport{
			Level:     "safe",
			Namespace: "ApexEDR",
			Predicate: "BackupExclusion",
			Value:     fmt.Sprintf("Excluded Verified Backup Vendor: %s", vendor),
			TLP:       tlp,
			PAP:       pap,
		}
		res.ObservableResult = &CortexObservableResult{
			ObservableType:  "process",
			ObservableValue: cmdline,
			Success:         true,
			Summary:         fmt.Sprintf("Process command line verified safe under %s backup exclusion", vendor),
			Taxonomies:      []CortexTaxonomyReport{tax},
			Artifacts: map[string]interface{}{
				"excluded":       true,
				"excludedVendor": vendor,
				"parentName":     proc.ParentName,
				"parentExePath":  proc.ParentExePath,
			},
			AnalyzedAt: time.Now().UTC().Format(time.RFC3339),
		}
		res.Message = res.ObservableResult.Summary
		res.Output["level"] = "safe"
		res.Output["excluded"] = true
		res.Output["excludedVendor"] = vendor
		return
	}

	det := AnalyzeCommandLine(proc)
	if det != nil {
		EnqueueDetection(*det)
		level := "malicious"
		if det.Severity == "medium" || det.Severity == "low" {
			level = "suspicious"
		}
		var mitre []string
		if m, ok := det.RawEvidence["mitreTechniqueId"].(string); ok && m != "" {
			mitre = append(mitre, m)
		}

		tax := CortexTaxonomyReport{
			Level:     level,
			Namespace: "ApexEDR",
			Predicate: "ProcessReflex",
			Value:     fmt.Sprintf("%s (%s)", det.RuleID, det.Category),
			TLP:       tlp,
			PAP:       pap,
		}
		res.ObservableResult = &CortexObservableResult{
			ObservableType:  "process",
			ObservableValue: cmdline,
			Success:         true,
			Summary:         det.Summary,
			Taxonomies:      []CortexTaxonomyReport{tax},
			MitreAttackTags: mitre,
			Artifacts: map[string]interface{}{
				"ruleId":     det.RuleID,
				"ruleName":   det.RuleName,
				"severity":   det.Severity,
				"confidence": det.Confidence,
				"category":   det.Category,
			},
			AnalyzedAt: time.Now().UTC().Format(time.RFC3339),
		}
		res.Message = det.Summary
		res.Output["level"] = level
		res.Output["ruleId"] = det.RuleID
		res.Output["mitreAttackTags"] = mitre
		return
	}

	tax := CortexTaxonomyReport{
		Level:     "safe",
		Namespace: "ApexEDR",
		Predicate: "ProcessReflex",
		Value:     "BenignProcessCmdline",
		TLP:       tlp,
		PAP:       pap,
	}
	res.ObservableResult = &CortexObservableResult{
		ObservableType:  "process",
		ObservableValue: cmdline,
		Success:         true,
		Summary:         "No recovery-inhibition or malicious PowerShell patterns matched",
		Taxonomies:      []CortexTaxonomyReport{tax},
		AnalyzedAt:      time.Now().UTC().Format(time.RFC3339),
	}
	res.Message = res.ObservableResult.Summary
	res.Output["level"] = "safe"
}

// 3. shuffle_reseed_canaries: Verifies or reseeds Canary tripwire files via canary.go.
func runShuffleReseedCanaries(params map[string]interface{}, res *ShuffleExecutionResult) {
	canaryDir := paramStr(params, "canaryDir", "directory", "path")
	paths, err := RestoreCanaryFiles(canaryDir)
	if err != nil {
		res.Status = "FAILURE"
		res.Success = false
		res.Message = fmt.Sprintf("shuffle_reseed_canaries failed: %v", err)
		return
	}
	_, intact, _ := CheckCanaryFiles(canaryDir)
	tax := CortexTaxonomyReport{
		Level:     "info",
		Namespace: "ApexSOAR",
		Predicate: "CanaryTripwire",
		Value:     fmt.Sprintf("Reseeded %d canary files (intact=%v)", len(paths), intact),
		TLP:       1,
		PAP:       1,
	}
	res.ObservableResult = &CortexObservableResult{
		ObservableType:  "file",
		ObservableValue: canaryDir,
		Success:         true,
		Summary:         fmt.Sprintf("Reseeded and verified %d ApexMSP canary tripwire files", len(paths)),
		Taxonomies:      []CortexTaxonomyReport{tax},
		Artifacts: map[string]interface{}{
			"canaryPaths": paths,
			"intact":      intact,
		},
		AnalyzedAt: time.Now().UTC().Format(time.RFC3339),
	}
	res.Message = res.ObservableResult.Summary
	res.Output["canaryPaths"] = paths
	res.Output["intact"] = intact
}

// 4. shuffle_quarantine_and_verify: Quarantines a malicious path via scanner.go and returns
// a cryptographic SHA-256 quarantine receipt.
func runShuffleQuarantineAndVerify(params map[string]interface{}, res *ShuffleExecutionResult) {
	filePath := paramStr(params, "filePath", "path", "targetPath")
	quarDir := paramStr(params, "quarantineDir")
	reason := paramStr(params, "reason")
	if reason == "" {
		reason = "Shuffle SOAR Automated Containment Playbook"
	}

	manifest, err := QuarantineFile(filePath, quarDir, reason)
	if err != nil {
		res.Status = "FAILURE"
		res.Success = false
		res.Message = fmt.Sprintf("shuffle_quarantine_and_verify failed: %v", err)
		return
	}

	// Verify that original path is absent and .quar exists with 0000 permissions
	_, origErr := os.Stat(manifest.OriginalPath)
	origRemoved := os.IsNotExist(origErr)
	qInfo, qErr := os.Stat(manifest.QuarantinePath)
	quarSecured := qErr == nil && qInfo.Mode().Perm() == 0000

	tax := CortexTaxonomyReport{
		Level:     "malicious",
		Namespace: "ApexSOAR",
		Predicate: "QuarantineReceipt",
		Value:     fmt.Sprintf("SHA256:%s (verified=%v)", manifest.SHA256[:16], origRemoved && quarSecured),
		TLP:       2,
		PAP:       2,
	}
	res.ObservableResult = &CortexObservableResult{
		ObservableType:  "file",
		ObservableValue: manifest.OriginalPath,
		Success:         origRemoved && quarSecured,
		Summary:         fmt.Sprintf("Quarantined %s -> %s (SHA-256: %s)", filepath.Base(manifest.OriginalPath), manifest.QuarantinePath, manifest.SHA256),
		Taxonomies:      []CortexTaxonomyReport{tax},
		Artifacts: map[string]interface{}{
			"manifest":        manifest,
			"originalRemoved": origRemoved,
			"mode0000":        quarSecured,
		},
		AnalyzedAt: time.Now().UTC().Format(time.RFC3339),
	}
	res.Message = res.ObservableResult.Summary
	res.Output["sha256"] = manifest.SHA256
	res.Output["quarantinePath"] = manifest.QuarantinePath
	res.Output["manifestPath"] = manifest.ManifestPath
	res.Output["verified"] = origRemoved && quarSecured
}

// 5. shuffle_protected_asset_check: Evaluates whether a target IP/MAC/SwitchPort/VLAN/Criticality
// is a protected POS/PAX/Municipal or shared-port asset before allowing automatic containment.
func runShuffleProtectedAssetCheck(params map[string]interface{}, res *ShuffleExecutionResult) {
	ip := paramStr(params, "ip", "ipAddress", "targetIp")
	mac := strings.ToLower(paramStr(params, "mac", "macAddress", "targetMac"))
	criticality := strings.ToLower(paramStr(params, "assetCriticality", "criticality"))
	vlanID := paramIntDefault(params, "vlanId", 0)
	switchPortHostCount := paramIntDefault(params, "switchPortHostCount", 1)
	isUplinkPort := strings.EqualFold(paramStr(params, "isUplinkPort"), "true")
	humanApproved := strings.EqualFold(paramStr(params, "humanApproved"), "true")

	var blockReasons []string

	// Check 1: Explicit protected asset criticality classes
	if criticality == "protected_never_auto_isolate" ||
		criticality == "pos_payment" ||
		criticality == "pos_controller" ||
		criticality == "municipal_critical" ||
		criticality == "infrastructure" {
		blockReasons = append(blockReasons, fmt.Sprintf("assetCriticality=%s is protected", criticality))
	}

	// Check 2: POS Payment VLAN 88 or PAX / Ingenico / Verifone payment terminal OUI / subnet heuristics
	if vlanID == 88 || strings.HasPrefix(ip, "10.88.") || strings.HasPrefix(ip, "192.168.88.") {
		blockReasons = append(blockReasons, "target resides on Protected POS Payment VLAN 88")
	}

	// Known PAX / Verifone / Ingenico payment terminal MAC prefixes
	paymentOUIs := []string{"00:1d:ea", "94:f6:65", "50:31:ad", "00:0b:81"}
	for _, oui := range paymentOUIs {
		if strings.HasPrefix(mac, oui) {
			blockReasons = append(blockReasons, fmt.Sprintf("MAC %s matches POS Payment Terminal OUI (%s)", mac, oui))
		}
	}

	// Check 3: Shared switch port or trunk/uplink guard (never PoE-cycle or disable a port with >1 MAC or uplink)
	if isUplinkPort || switchPortHostCount > 1 {
		blockReasons = append(blockReasons, fmt.Sprintf("shared/uplink switch port guard (hostCount=%d, isUplink=%v)", switchPortHostCount, isUplinkPort))
	}

	isProtected := len(blockReasons) > 0
	autoContainmentAllowed := !isProtected || humanApproved

	level := "safe"
	predValue := "AutoContainmentPermitted"
	if isProtected && !humanApproved {
		level = "suspicious"
		predValue = "ProtectedAssetHumanApprovalRequired"
		res.Status = "BLOCKED_PROTECTED_ASSET"
	} else if isProtected && humanApproved {
		level = "info"
		predValue = "ProtectedAssetHumanApproved"
	}

	tax := CortexTaxonomyReport{
		Level:     level,
		Namespace: "ApexGuard",
		Predicate: "ProtectedAssetCheck",
		Value:     predValue,
		TLP:       2,
		PAP:       2,
	}

	targetDesc := ip
	if targetDesc == "" {
		targetDesc = mac
	}
	if targetDesc == "" {
		targetDesc = criticality
	}

	res.ObservableResult = &CortexObservableResult{
		ObservableType:  "host",
		ObservableValue: targetDesc,
		Success:         true,
		Summary:         fmt.Sprintf("Protected Asset Check: protected=%v autoContainmentAllowed=%v reasons=%v", isProtected, autoContainmentAllowed, blockReasons),
		Taxonomies:      []CortexTaxonomyReport{tax},
		Artifacts: map[string]interface{}{
			"isProtected":            isProtected,
			"autoContainmentAllowed": autoContainmentAllowed,
			"humanApproved":          humanApproved,
			"blockReasons":           blockReasons,
			"vlanId":                 vlanID,
			"switchPortHostCount":    switchPortHostCount,
		},
		AnalyzedAt: time.Now().UTC().Format(time.RFC3339),
	}
	res.Message = res.ObservableResult.Summary
	res.Output["isProtected"] = isProtected
	res.Output["autoContainmentAllowed"] = autoContainmentAllowed
	res.Output["blockReasons"] = blockReasons
}

// Helper field unused in JSON but reserved if needed
type unusedMeta struct{}

var _ = (*unusedMeta)(nil)

func paramStr(m map[string]interface{}, keys ...string) string {
	if m == nil {
		return ""
	}
	for _, k := range keys {
		if val, ok := m[k]; ok {
			switch v := val.(type) {
			case string:
				if strings.TrimSpace(v) != "" {
					return strings.TrimSpace(v)
				}
			case bool:
				return strconv.FormatBool(v)
			}
		}
	}
	return ""
}

func paramIntDefault(m map[string]interface{}, key string, def int) int {
	if m == nil {
		return def
	}
	if val, ok := m[key]; ok {
		switch v := val.(type) {
		case int:
			return v
		case int64:
			return int(v)
		case float64:
			return int(v)
		case string:
			if parsed, err := strconv.Atoi(strings.TrimSpace(v)); err == nil {
				return parsed
			}
		}
	}
	return def
}
