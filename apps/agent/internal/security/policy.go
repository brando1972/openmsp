package security

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

// SharkFinSecurityPolicy defines the live, toggleable protection module states controlled by
// the Shark Fin menu bar / system tray client and the ApexMSP SOC Console.
type SharkFinSecurityPolicy struct {
	PreventiveAvEnabled         bool   `json:"preventiveAvEnabled"`
	EndpointEdrEnabled          bool   `json:"endpointEdrEnabled"`
	RansomwareProtectionEnabled bool   `json:"ransomwareProtectionEnabled"`
	CanaryTripwireEnabled       bool   `json:"canaryTripwireEnabled"`
	YaraClamScannerEnabled      bool   `json:"yaraClamScannerEnabled"`
	SoarOrborusWorkerEnabled    bool   `json:"soarOrborusWorkerEnabled"`
	PolicyLockedByAdmin         bool   `json:"policyLockedByAdmin"`
	UpdatedAt                   string `json:"updatedAt"`
	UpdatedBy                   string `json:"updatedBy"`
}

var (
	policyMu           sync.Mutex
	overridePolicyPath string
)

// SetPolicyPathForTesting overrides the default security-policy.json path during unit tests.
func SetPolicyPathForTesting(path string) {
	policyMu.Lock()
	defer policyMu.Unlock()
	overridePolicyPath = path
}

// DefaultPolicyPath returns the OS-specific path for security-policy.json
// (~/.apexmsp/security-policy.json on macOS/Linux, C:\ProgramData\ApexMSP\security-policy.json on Windows).
func DefaultPolicyPath() string {
	policyMu.Lock()
	custom := overridePolicyPath
	policyMu.Unlock()
	if custom != "" {
		return custom
	}

	if runtime.GOOS == "windows" {
		progData := os.Getenv("ProgramData")
		if progData == "" {
			progData = `C:\ProgramData`
		}
		return filepath.Join(progData, "ApexMSP", "security-policy.json")
	}
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return filepath.Join(os.TempDir(), ".apexmsp", "security-policy.json")
	}
	return filepath.Join(home, ".apexmsp", "security-policy.json")
}

// DefaultSecurityPolicy returns the default all-protections-enabled policy.
func DefaultSecurityPolicy() SharkFinSecurityPolicy {
	return SharkFinSecurityPolicy{
		PreventiveAvEnabled:         true,
		EndpointEdrEnabled:          true,
		RansomwareProtectionEnabled: true,
		CanaryTripwireEnabled:       true,
		YaraClamScannerEnabled:      true,
		SoarOrborusWorkerEnabled:    true,
		PolicyLockedByAdmin:         false,
		UpdatedAt:                   time.Now().UTC().Format(time.RFC3339),
		UpdatedBy:                   "system_default",
	}
}

// LoadSecurityPolicy reads the live SharkFinSecurityPolicy from disk.
// If the file does not exist yet, it initializes the default policy file and returns it.
func LoadSecurityPolicy(customPath ...string) SharkFinSecurityPolicy {
	path := resolvePolicyPath(customPath...)

	policyMu.Lock()
	defer policyMu.Unlock()

	data, err := os.ReadFile(path)
	if err != nil {
		def := DefaultSecurityPolicy()
		_ = writePolicyLocked(path, def)
		return def
	}

	// Start with defaults so any omitted boolean field defaults to true unless explicitly false in JSON
	pol := DefaultSecurityPolicy()
	if err := json.Unmarshal(data, &pol); err != nil {
		return DefaultSecurityPolicy()
	}
	if pol.UpdatedAt == "" {
		pol.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	}
	if pol.UpdatedBy == "" {
		pol.UpdatedBy = "sharkfin_client"
	}
	return pol
}

// SaveSecurityPolicy writes the SharkFinSecurityPolicy to disk.
func SaveSecurityPolicy(pol SharkFinSecurityPolicy, customPath ...string) error {
	path := resolvePolicyPath(customPath...)
	if pol.UpdatedAt == "" {
		pol.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	}
	if pol.UpdatedBy == "" {
		pol.UpdatedBy = "sharkfin_client"
	}

	policyMu.Lock()
	defer policyMu.Unlock()
	return writePolicyLocked(path, pol)
}

// ApplyPolicyUpdate merges partial boolean updates into the persisted SharkFinSecurityPolicy.
// When PolicyLockedByAdmin is true, local "sharkfin_client" requests cannot disable protections.
func ApplyPolicyUpdate(patch map[string]interface{}, source string, customPath ...string) (SharkFinSecurityPolicy, error) {
	current := LoadSecurityPolicy(customPath...)
	if source == "" {
		source = extractPolicyStr(patch, "updatedBy", "source")
	}
	if source == "" {
		source = "soc_console"
	}

	isAdminSource := strings.EqualFold(source, "soc_console") ||
		strings.EqualFold(source, "admin") ||
		strings.EqualFold(source, "control_plane")

	// Enforce admin lock if a local user tries to turn off any protection from Shark Fin tray
	if current.PolicyLockedByAdmin && !isAdminSource {
		for _, key := range []string{
			"preventiveAvEnabled",
			"endpointEdrEnabled",
			"ransomwareProtectionEnabled",
			"canaryTripwireEnabled",
			"yaraClamScannerEnabled",
			"soarOrborusWorkerEnabled",
		} {
			if val, exists := extractPolicyBool(patch, key); exists && !val {
				return current, errors.New("security policy is locked by administrator; local Shark Fin client cannot disable protections")
			}
		}
	}

	if v, ok := extractPolicyBool(patch, "preventiveAvEnabled", "avRealtimeEnabled"); ok {
		current.PreventiveAvEnabled = v
	}
	if v, ok := extractPolicyBool(patch, "endpointEdrEnabled", "edrReflexEnabled"); ok {
		current.EndpointEdrEnabled = v
	}
	if v, ok := extractPolicyBool(patch, "ransomwareProtectionEnabled", "recoveryInhibitionAutoKill"); ok {
		current.RansomwareProtectionEnabled = v
	}
	if v, ok := extractPolicyBool(patch, "canaryTripwireEnabled"); ok {
		current.CanaryTripwireEnabled = v
	}
	if v, ok := extractPolicyBool(patch, "yaraClamScannerEnabled"); ok {
		current.YaraClamScannerEnabled = v
	}
	if v, ok := extractPolicyBool(patch, "soarOrborusWorkerEnabled"); ok {
		current.SoarOrborusWorkerEnabled = v
	}
	if isAdminSource {
		if v, ok := extractPolicyBool(patch, "policyLockedByAdmin"); ok {
			current.PolicyLockedByAdmin = v
		}
	}

	current.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	current.UpdatedBy = source

	if err := SaveSecurityPolicy(current, customPath...); err != nil {
		return current, err
	}
	return current, nil
}

func resolvePolicyPath(customPath ...string) string {
	if len(customPath) > 0 && strings.TrimSpace(customPath[0]) != "" {
		return strings.TrimSpace(customPath[0])
	}
	return DefaultPolicyPath()
}

func writePolicyLocked(path string, pol SharkFinSecurityPolicy) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return fmt.Errorf("mkdir policy dir: %w", err)
	}
	raw, err := json.MarshalIndent(pol, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal policy: %w", err)
	}
	return os.WriteFile(path, raw, 0600)
}

func extractPolicyBool(m map[string]interface{}, keys ...string) (bool, bool) {
	if m == nil {
		return false, false
	}
	for _, k := range keys {
		if val, ok := m[k]; ok {
			switch v := val.(type) {
			case bool:
				return v, true
			case string:
				if parsed, err := strconv.ParseBool(strings.TrimSpace(v)); err == nil {
					return parsed, true
				}
			case float64:
				return v != 0, true
			case int:
				return v != 0, true
			}
		}
	}
	return false, false
}

func extractPolicyStr(m map[string]interface{}, keys ...string) string {
	if m == nil {
		return ""
	}
	for _, k := range keys {
		if val, ok := m[k]; ok {
			if s, ok := val.(string); ok && strings.TrimSpace(s) != "" {
				return strings.TrimSpace(s)
			}
		}
	}
	return ""
}
