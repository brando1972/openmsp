package security

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"openmsp/agent/internal/client"
)

// CanaryTemplate defines a deterministic benign canary tripwire file and its expected SHA-256 hash.
type CanaryTemplate struct {
	Filename string
	Content  []byte
	SHA256   string
}

var defaultCanaryTemplates []CanaryTemplate

func init() {
	rawTemplates := []struct {
		name string
		body string
	}{
		{
			name: "00_APEX_CANARY_DO_NOT_MODIFY.docx",
			body: "PK\x03\x04APEXMSP-CANARY-TRIPWIRE-DOCX-V1: DO NOT MODIFY, ENCRYPT, RENAME, OR DELETE THIS FILE. " +
				"This file is a benign ransomware canary tripwire monitored by the ApexMSP Endpoint Security Agent. " +
				"Any unauthorized modification triggers immediate high-confidence ransomware containment.\n",
		},
		{
			name: "00_APEX_FINANCIAL_LEDGER_CANARY.xlsx",
			body: "PK\x03\x04APEXMSP-CANARY-TRIPWIRE-XLSX-V1: Q4_FINANCIAL_LEDGER_RESERVE_ACCOUNT_SUMMARY. " +
				"Benign decoy spreadsheet monitored by ApexMSP EDR. Unauthorized encryption or tampering " +
				"generates ruleId=APEX-EDR-CANARY-001.\n",
		},
		{
			name: "00_APEX_BACKUP_KEY_CANARY.txt",
			body: "APEXMSP-CANARY-TRIPWIRE-TXT-V1\n" +
				"VaultBackupKeyReference: canary-decoy-do-not-touch-9f8e7d6c5b4a\n" +
				"Notice: This file is an integrity-monitored ransomware tripwire.\n",
		},
	}

	for _, rt := range rawTemplates {
		b := []byte(rt.body)
		sum := sha256.Sum256(b)
		defaultCanaryTemplates = append(defaultCanaryTemplates, CanaryTemplate{
			Filename: rt.name,
			Content:  b,
			SHA256:   hex.EncodeToString(sum[:]),
		})
	}
}

// DefaultCanaryTemplates returns a copy of the standard ApexMSP canary file definitions.
func DefaultCanaryTemplates() []CanaryTemplate {
	out := make([]CanaryTemplate, len(defaultCanaryTemplates))
	copy(out, defaultCanaryTemplates)
	return out
}

// DefaultCanaryDir returns the OS-appropriate safe directory for ApexMSP canary tripwire files.
func DefaultCanaryDir() string {
	if runtime.GOOS == "windows" {
		progData := os.Getenv("ProgramData")
		if progData == "" {
			progData = `C:\ProgramData`
		}
		return filepath.Join(progData, "ApexMSP", "canary")
	}
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return filepath.Join(os.TempDir(), ".apexmsp", "canary")
	}
	return filepath.Join(home, ".apexmsp", "canary")
}

// EnsureCanaryFiles deploys or refreshes the baseline canary tripwire files inside dir.
func EnsureCanaryFiles(dir string) ([]string, error) {
	if dir == "" {
		dir = DefaultCanaryDir()
	}
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, fmt.Errorf("create canary dir %s: %w", dir, err)
	}

	paths := make([]string, 0, len(defaultCanaryTemplates))
	for _, tpl := range defaultCanaryTemplates {
		fullPath := filepath.Join(dir, tpl.Filename)
		if err := os.WriteFile(fullPath, tpl.Content, 0600); err != nil {
			return paths, fmt.Errorf("write canary file %s: %w", fullPath, err)
		}
		paths = append(paths, fullPath)
	}
	return paths, nil
}

// RestoreCanaryFiles cleans up any renamed/encrypted artifacts in dir and restores pristine canary files.
func RestoreCanaryFiles(dir string) ([]string, error) {
	if dir == "" {
		dir = DefaultCanaryDir()
	}
	entries, err := os.ReadDir(dir)
	if err == nil {
		for _, e := range entries {
			_ = os.Remove(filepath.Join(dir, e.Name()))
		}
	}
	return EnsureCanaryFiles(dir)
}

// CheckCanaryFiles verifies all baseline canary files in dir against their SHA-256 baselines
// and checks for ransomware rename/encryption extensions.
func CheckCanaryFiles(dir string) (detections []client.SecurityDetectionInput, allIntact bool, deployedPaths []string) {
	if !LoadSecurityPolicy().CanaryTripwireEnabled {
		return nil, false, nil
	}
	if dir == "" {
		dir = DefaultCanaryDir()
	}

	allIntact = true
	nowStr := time.Now().UTC().Format(time.RFC3339)

	// Map existing files in directory to detect renames (e.g. .locked, .encrypted)
	entries, readErr := os.ReadDir(dir)
	existingNames := make(map[string]bool)
	var suspiciousRenamed []string

	if readErr == nil {
		for _, e := range entries {
			name := e.Name()
			existingNames[name] = true
			lower := strings.ToLower(name)
			if isSuspiciousRansomwareArtifact(lower) {
				suspiciousRenamed = append(suspiciousRenamed, filepath.Join(dir, name))
			}
		}
	}

	for _, tpl := range defaultCanaryTemplates {
		fullPath := filepath.Join(dir, tpl.Filename)
		data, err := os.ReadFile(fullPath)
		if err != nil {
			allIntact = false
			action := "deleted"
			summary := fmt.Sprintf("Ransomware Canary tripwire file deleted: %s", tpl.Filename)
			ruleID := "APEX-EDR-CANARY-DEL"
			ruleName := "ApexMSP Canary Tripwire Deleted"

			// Check if it was renamed to a ransomware extension in the same folder
			for _, susp := range suspiciousRenamed {
				if strings.Contains(filepath.Base(susp), tpl.Filename) {
					action = "renamed"
					summary = fmt.Sprintf("Ransomware Canary tripwire renamed to suspicious extension: %s -> %s", tpl.Filename, filepath.Base(susp))
					ruleID = "APEX-EDR-CANARY-REN"
					ruleName = "ApexMSP Canary Tripwire Renamed (Ransomware Extension)"
					break
				}
			}

			detections = append(detections, client.SecurityDetectionInput{
				EventID:        fmt.Sprintf("det-canary-%s-%d", action, time.Now().UnixNano()),
				IdempotencyKey: fmt.Sprintf("canary:%s:%s:%s", fullPath, action, tpl.SHA256[:12]),
				EventTime:      nowStr,
				SourceProvider: "apex_agent",
				RuleID:         ruleID,
				RuleName:       ruleName,
				Severity:       "critical",
				Confidence:     0.99,
				Category:       "canary_tripwire",
				Summary:        summary,
				File: &client.SecurityFileContext{
					Path:   fullPath,
					SHA256: tpl.SHA256,
					Action: action,
				},
				RawEvidence: map[string]interface{}{
					"expectedSha256":    tpl.SHA256,
					"canaryFilename":    tpl.Filename,
					"suspiciousRenames": suspiciousRenamed,
				},
				IsBenignSimulation: true,
			})
			continue
		}

		sum := sha256.Sum256(data)
		actualHash := hex.EncodeToString(sum[:])
		if actualHash != tpl.SHA256 {
			allIntact = false
			entropy := CalculateShannonEntropy(data)
			highEntropy := entropy >= 6.5

			ruleID := "APEX-EDR-CANARY-MOD"
			ruleName := "ApexMSP Canary Tripwire Tampered"
			summary := fmt.Sprintf("Ransomware Canary tripwire modified: %s (entropy=%.2f bits/byte)", tpl.Filename, entropy)
			if highEntropy {
				ruleID = "APEX-EDR-CANARY-ENC"
				ruleName = "ApexMSP Canary Tripwire High-Entropy Overwrite (Encryption)"
				summary = fmt.Sprintf("High-entropy encryption overwrite detected on Canary tripwire: %s (entropy=%.2f bits/byte)", tpl.Filename, entropy)
			}

			detections = append(detections, client.SecurityDetectionInput{
				EventID:        fmt.Sprintf("det-canary-mod-%d", time.Now().UnixNano()),
				IdempotencyKey: fmt.Sprintf("canary:mod:%s:%s", fullPath, actualHash[:16]),
				EventTime:      nowStr,
				SourceProvider: "apex_agent",
				RuleID:         ruleID,
				RuleName:       ruleName,
				Severity:       "critical",
				Confidence:     0.99,
				Category:       "canary_tripwire",
				Summary:        summary,
				File: &client.SecurityFileContext{
					Path:   fullPath,
					SHA256: actualHash,
					Action: "modified",
				},
				RawEvidence: map[string]interface{}{
					"expectedSha256": tpl.SHA256,
					"actualSha256":   actualHash,
					"shannonEntropy": entropy,
					"highEntropy":    highEntropy,
					"sizeBytes":      len(data),
				},
				IsBenignSimulation: true,
			})
			continue
		}

		deployedPaths = append(deployedPaths, fullPath)
	}

	// Also emit detection if standalone suspicious ransom notes or .locked files were dropped in the canary dir
	// even if baseline files weren't deleted yet
	if len(detections) == 0 && len(suspiciousRenamed) > 0 {
		allIntact = false
		suspPath := suspiciousRenamed[0]
		detections = append(detections, client.SecurityDetectionInput{
			EventID:        fmt.Sprintf("det-canary-ext-%d", time.Now().UnixNano()),
			IdempotencyKey: fmt.Sprintf("canary:ext:%s", suspPath),
			EventTime:      nowStr,
			SourceProvider: "apex_agent",
			RuleID:         "APEX-EDR-CANARY-REN",
			RuleName:       "Suspicious Ransomware File Created in Canary Directory",
			Severity:       "critical",
			Confidence:     0.98,
			Category:       "canary_tripwire",
			Summary:        fmt.Sprintf("Suspicious ransomware artifact detected in canary directory: %s", filepath.Base(suspPath)),
			File: &client.SecurityFileContext{
				Path:   suspPath,
				Action: "renamed",
			},
			RawEvidence: map[string]interface{}{
				"suspiciousFiles": suspiciousRenamed,
			},
			IsBenignSimulation: true,
		})
	}

	return detections, allIntact, deployedPaths
}

func isSuspiciousRansomwareArtifact(lowerName string) bool {
	badSuffixes := []string{
		".locked", ".encrypted", ".crypt", ".crypted", ".enc",
		".lockbit", ".akira", ".ryuk", ".blackcat", ".alphv", ".wannacry",
	}
	for _, s := range badSuffixes {
		if strings.HasSuffix(lowerName, s) {
			return true
		}
	}
	if strings.Contains(lowerName, "readme_restore") ||
		strings.Contains(lowerName, "decrypt_instructions") ||
		strings.Contains(lowerName, "how_to_decrypt") {
		return true
	}
	return false
}

// CalculateShannonEntropy calculates the Shannon entropy of a byte slice in bits per byte (0.0 to 8.0).
func CalculateShannonEntropy(data []byte) float64 {
	if len(data) == 0 {
		return 0.0
	}
	var counts [256]int
	for _, b := range data {
		counts[b]++
	}
	total := float64(len(data))
	entropy := 0.0
	for _, count := range counts {
		if count == 0 {
			continue
		}
		p := float64(count) / total
		entropy -= p * math.Log2(p)
	}
	return entropy
}
