package security

import (
	"encoding/json"
	"fmt"
	"runtime"
	"strconv"
	"strings"
	"time"

	"openmsp/agent/internal/client"
)

// ProcessInfo represents an active OS process or telemetry event inspected by the EDR reflex engine.
type ProcessInfo struct {
	PID           int
	PPID          int
	User          string
	Name          string
	ExePath       string
	Cmdline       string
	ParentName    string
	ParentExePath string
	Signed        *bool
	Signer        string
}

type reflexRule struct {
	RuleID      string
	RuleName    string
	Category    string
	Severity    string
	Confidence  float64
	MitreID     string
	Description string
	Match       func(lowerCmd string, lowerName string) bool
}

var edrReflexRules = []reflexRule{
	{
		RuleID:      "APEX-EDR-RI-001",
		RuleName:    "Ransomware Recovery Inhibition: VSS Shadow Copy Deletion/Resize (vssadmin)",
		Category:    "recovery_inhibition",
		Severity:    "critical",
		Confidence:  0.98,
		MitreID:     "T1490",
		Description: "Detects vssadmin shadow copy deletion or shadowstorage shrinking commonly used by ransomware prior to encryption",
		Match: func(lowerCmd, _ string) bool {
			if !strings.Contains(lowerCmd, "vssadmin") {
				return false
			}
			return (strings.Contains(lowerCmd, "delete") && strings.Contains(lowerCmd, "shadows")) ||
				(strings.Contains(lowerCmd, "resize") && strings.Contains(lowerCmd, "shadowstorage"))
		},
	},
	{
		RuleID:      "APEX-EDR-RI-002",
		RuleName:    "Ransomware Recovery Inhibition: WMI Shadowcopy Delete (wmic)",
		Category:    "recovery_inhibition",
		Severity:    "critical",
		Confidence:  0.98,
		MitreID:     "T1490",
		Description: "Detects wmic shadowcopy delete invocation used to inhibit Windows Volume Shadow Copy recovery",
		Match: func(lowerCmd, _ string) bool {
			return strings.Contains(lowerCmd, "wmic") &&
				strings.Contains(lowerCmd, "shadowcopy") &&
				strings.Contains(lowerCmd, "delete")
		},
	},
	{
		RuleID:      "APEX-EDR-RI-003",
		RuleName:    "Ransomware Recovery Inhibition: Windows Backup Catalog Deletion (wbadmin)",
		Category:    "recovery_inhibition",
		Severity:    "critical",
		Confidence:  0.97,
		MitreID:     "T1490",
		Description: "Detects wbadmin deletion of backup catalogs or system state backups",
		Match: func(lowerCmd, _ string) bool {
			return strings.Contains(lowerCmd, "wbadmin") &&
				strings.Contains(lowerCmd, "delete") &&
				(strings.Contains(lowerCmd, "catalog") || strings.Contains(lowerCmd, "systemstatebackup") || strings.Contains(lowerCmd, "backup"))
		},
	},
	{
		RuleID:      "APEX-EDR-RI-004",
		RuleName:    "Ransomware Recovery Inhibition: Boot Configuration Recovery Disabled (bcdedit)",
		Category:    "recovery_inhibition",
		Severity:    "critical",
		Confidence:  0.97,
		MitreID:     "T1490",
		Description: "Detects bcdedit disabling Windows Automatic Repair or ignoring boot failures",
		Match: func(lowerCmd, _ string) bool {
			if !strings.Contains(lowerCmd, "bcdedit") {
				return false
			}
			return (strings.Contains(lowerCmd, "recoveryenabled") && strings.Contains(lowerCmd, "no")) ||
				(strings.Contains(lowerCmd, "bootstatuspolicy") && strings.Contains(lowerCmd, "ignoreallfailures"))
		},
	},
	{
		RuleID:      "APEX-EDR-RI-005",
		RuleName:    "Ransomware Recovery Inhibition: Free Space Wipe (cipher /w:)",
		Category:    "recovery_inhibition",
		Severity:    "high",
		Confidence:  0.92,
		MitreID:     "T1485",
		Description: "Detects cipher.exe /w: free-space wiping used by ransomware to prevent forensic file carving",
		Match: func(lowerCmd, _ string) bool {
			return strings.Contains(lowerCmd, "cipher") &&
				(strings.Contains(lowerCmd, "/w:") || strings.Contains(lowerCmd, "-w:"))
		},
	},
	{
		RuleID:      "APEX-EDR-PS-001",
		RuleName:    "Suspicious Obfuscated or Download-Cradle PowerShell Execution",
		Category:    "malware",
		Severity:    "high",
		Confidence:  0.90,
		MitreID:     "T1059.001",
		Description: "Detects PowerShell invoked with encoded commands, Base64 decoding, or remote WebClient download cradles",
		Match: func(lowerCmd, lowerName string) bool {
			isPS := strings.Contains(lowerName, "powershell") || strings.Contains(lowerName, "pwsh") ||
				strings.Contains(lowerCmd, "powershell") || strings.Contains(lowerCmd, "pwsh")
			if !isPS {
				return false
			}
			hasEncFlag := strings.Contains(lowerCmd, " -enc ") ||
				strings.Contains(lowerCmd, " -encodedcommand ") ||
				strings.Contains(lowerCmd, " -e ") && strings.Contains(lowerCmd, "bypass")
			hasCradle := strings.Contains(lowerCmd, "frombase64string") ||
				strings.Contains(lowerCmd, "downloadstring") ||
				(strings.Contains(lowerCmd, "net.webclient") && strings.Contains(lowerCmd, "iex"))
			return hasEncFlag || hasCradle
		},
	},
}

// TrustedBackupExclusion describes a verified legitimate backup or maintenance context
// that is allowed to manage VSS snapshots or backup catalogs without triggering false-positive alerts.
type TrustedBackupExclusion struct {
	Vendor      string
	BinaryNames []string
	PathPrefixes []string
	Signers     []string
}

var trustedBackupExclusions = []TrustedBackupExclusion{
	{
		Vendor:      "Veeam Backup & Replication",
		BinaryNames: []string{"veeamagent.exe", "veeam.backup.service.exe", "veeam.guest.interaction.proxy.exe", "veeamdeploymentservice.exe", "veeamagent"},
		PathPrefixes: []string{
			`c:\program files\veeam\`,
			`c:\program files (x86)\veeam\`,
			`/usr/sbin/veeam`,
			`/opt/veeam/`,
		},
		Signers: []string{"veeam software"},
	},
	{
		Vendor:      "Acronis Cyber Protect",
		BinaryNames: []string{"mms.exe", "acronis_mms", "service_process.exe", "trueimage.exe"},
		PathPrefixes: []string{
			`c:\program files\acronis\`,
			`c:\program files (x86)\acronis\`,
			`/usr/lib/acronis/`,
		},
		Signers: []string{"acronis international"},
	},
	{
		Vendor:      "Datto Continuity Agent",
		BinaryNames: []string{"dattobackupagent.exe", "dattoprovider.exe", "dlad"},
		PathPrefixes: []string{
			`c:\program files\datto\`,
			`c:\program files (x86)\datto\`,
			`/usr/sbin/dlad`,
		},
		Signers: []string{"datto, inc"},
	},
	{
		Vendor:      "Windows Server Backup Scheduled Maintenance",
		BinaryNames: []string{"wbengine.exe"},
		PathPrefixes: []string{
			`c:\windows\system32\wbengine.exe`,
		},
		Signers: []string{"microsoft windows"},
	},
}

// IsExcludedBackupTool evaluates whether a process or its parent belongs to a verified
// legitimate backup agent (e.g., Veeam, Acronis, Datto, or Windows Server Backup scheduled maintenance).
// To prevent attacker spoofing (e.g. running C:\Users\Public\VeeamAgent.exe), BOTH the binary/parent name
// AND the trusted installation path (or verified code signature) must match.
func IsExcludedBackupTool(proc ProcessInfo) (bool, string) {
	lowerName := strings.ToLower(strings.TrimSpace(proc.Name))
	lowerExe := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(proc.ExePath), "/", `\`))
	lowerParentName := strings.ToLower(strings.TrimSpace(proc.ParentName))
	lowerParentExe := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(proc.ParentExePath), "/", `\`))
	lowerSigner := strings.ToLower(strings.TrimSpace(proc.Signer))
	lowerCmd := strings.ToLower(strings.TrimSpace(proc.Cmdline))

	// Reject immediately if executable or parent path is in an untrusted user/temp directory
	untrustedDirs := []string{`\users\`, `\temp\`, `\tmp\`, `\appdata\`, `\programdata\temp`, `/tmp/`, `/var/tmp/`, `/users/`}
	for _, bad := range untrustedDirs {
		if strings.Contains(lowerExe, bad) || strings.Contains(lowerParentExe, bad) {
			return false, ""
		}
	}

	for _, excl := range trustedBackupExclusions {
		nameMatch := matchesAnyExact(lowerName, excl.BinaryNames) || matchesAnyExact(lowerParentName, excl.BinaryNames)
		if !nameMatch {
			continue
		}

		// Verify path prefix on either the process exe or the parent process exe
		pathMatch := hasAnyPrefix(lowerExe, excl.PathPrefixes) ||
			hasAnyPrefix(lowerParentExe, excl.PathPrefixes) ||
			hasAnyPrefix(strings.ToLower(proc.ExePath), excl.PathPrefixes) ||
			hasAnyPrefix(strings.ToLower(proc.ParentExePath), excl.PathPrefixes)

		signerMatch := proc.Signed != nil && *proc.Signed && containsAnySubstring(lowerSigner, excl.Signers)

		if pathMatch || signerMatch {
			return true, excl.Vendor
		}
	}

	// Also allow scheduled Windows Server Backup catalog pruning only when invoked directly by wbengine.exe
	// with explicit scheduled-maintenance context
	if lowerParentName == "wbengine.exe" && strings.HasPrefix(lowerParentExe, `c:\windows\system32\`) &&
		strings.Contains(lowerCmd, "scheduled-maintenance") {
		return true, "Windows Server Backup Scheduled Maintenance"
	}

	return false, ""
}

// AnalyzeCommandLine evaluates a single process execution against the ApexMSP EDR reflex ruleset.
// Returns nil if the command is benign or belongs to an excluded legitimate backup tool.
func AnalyzeCommandLine(proc ProcessInfo) *client.SecurityDetectionInput {
	if excluded, _ := IsExcludedBackupTool(proc); excluded {
		return nil
	}

	lowerCmd := strings.ToLower(strings.TrimSpace(proc.Cmdline))
	lowerName := strings.ToLower(strings.TrimSpace(proc.Name))
	if lowerCmd == "" {
		return nil
	}

	// Never flag the ApexMSP agent itself or grep/pgrep/unit-test runner processes scanning for strings
	if lowerName == "openmsp-agent" || lowerName == "grep" || lowerName == "pgrep" || lowerName == "rg" {
		return nil
	}

	for _, rule := range edrReflexRules {
		if rule.Match(lowerCmd, lowerName) {
			nowStr := time.Now().UTC().Format(time.RFC3339)
			isSim := strings.Contains(lowerCmd, "apexmsp-sim") ||
				strings.Contains(lowerCmd, "benign-simulation") ||
				strings.Contains(lowerCmd, "echo ")

			return &client.SecurityDetectionInput{
				EventID:        fmt.Sprintf("det-edr-%s-%d-%d", strings.ToLower(rule.RuleID), proc.PID, time.Now().UnixNano()),
				IdempotencyKey: fmt.Sprintf("edr:%s:%d:%s", rule.RuleID, proc.PID, lowerCmd),
				EventTime:      nowStr,
				SourceProvider: "apex_agent",
				RuleID:         rule.RuleID,
				RuleName:       rule.RuleName,
				Severity:       rule.Severity,
				Confidence:     rule.Confidence,
				Category:       rule.Category,
				Summary:        fmt.Sprintf("%s detected (PID %d: %s)", rule.RuleName, proc.PID, truncateStr(proc.Cmdline, 180)),
				Process: &client.SecurityProcessContext{
					PID:     proc.PID,
					PPID:    proc.PPID,
					Name:    proc.Name,
					ExePath: proc.ExePath,
					Cmdline: proc.Cmdline,
					User:    proc.User,
					Signed:  proc.Signed,
					Signer:  proc.Signer,
				},
				RawEvidence: map[string]interface{}{
					"mitreTechniqueId": rule.MitreID,
					"description":      rule.Description,
					"parentName":       proc.ParentName,
					"parentExePath":    proc.ParentExePath,
				},
				IsBenignSimulation: isSim,
			}
		}
	}

	return nil
}

// AnalyzeProcessList evaluates a slice of processes and returns all matching EDR detections.
func AnalyzeProcessList(procs []ProcessInfo) []client.SecurityDetectionInput {
	var out []client.SecurityDetectionInput
	for _, p := range procs {
		if det := AnalyzeCommandLine(p); det != nil {
			out = append(out, *det)
		}
	}
	return out
}

// ScanActiveProcessesForReflex inspects currently running OS processes for recovery-inhibition
// and suspicious PowerShell patterns.
func ScanActiveProcessesForReflex() []client.SecurityDetectionInput {
	procs := listActiveProcesses()
	return AnalyzeProcessList(procs)
}

func listActiveProcesses() []ProcessInfo {
	if runtime.GOOS == "windows" {
		return listWindowsProcesses()
	}
	return listUnixProcesses()
}

func listUnixProcesses() []ProcessInfo {
	out := runCmdTimeout(3*time.Second, "ps", "-axo", "pid=,ppid=,user=,comm=,args=")
	if out == "" {
		return nil
	}
	lines := strings.Split(out, "\n")
	procs := make([]ProcessInfo, 0, len(lines))
	for _, line := range lines {
		fields := strings.Fields(line)
		if len(fields) < 5 {
			continue
		}
		pid, err1 := strconv.Atoi(fields[0])
		ppid, err2 := strconv.Atoi(fields[1])
		if err1 != nil || err2 != nil {
			continue
		}
		user := fields[2]
		comm := fields[3]
		cmdline := strings.Join(fields[4:], " ")
		procs = append(procs, ProcessInfo{
			PID:     pid,
			PPID:    ppid,
			User:    user,
			Name:    comm,
			ExePath: comm,
			Cmdline: cmdline,
		})
	}
	return procs
}

func listWindowsProcesses() []ProcessInfo {
	psCmd := `Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine | ConvertTo-Json -Compress`
	out := runCmdTimeout(4*time.Second, "powershell.exe", "-NoProfile", "-NonInteractive", "-Command", psCmd)
	if out == "" {
		return nil
	}
	type winProc struct {
		ProcessId       int    `json:"ProcessId"`
		ParentProcessId int    `json:"ParentProcessId"`
		Name            string `json:"Name"`
		ExecutablePath  string `json:"ExecutablePath"`
		CommandLine     string `json:"CommandLine"`
	}
	var rawList []winProc
	if strings.HasPrefix(strings.TrimSpace(out), "{") {
		var single winProc
		if err := json.Unmarshal([]byte(out), &single); err == nil {
			rawList = append(rawList, single)
		}
	} else {
		_ = json.Unmarshal([]byte(out), &rawList)
	}

	procs := make([]ProcessInfo, 0, len(rawList))
	for _, r := range rawList {
		procs = append(procs, ProcessInfo{
			PID:     r.ProcessId,
			PPID:    r.ParentProcessId,
			Name:    r.Name,
			ExePath: r.ExecutablePath,
			Cmdline: r.CommandLine,
		})
	}
	return procs
}

func matchesAnyExact(target string, candidates []string) bool {
	if target == "" {
		return false
	}
	for _, c := range candidates {
		if target == c {
			return true
		}
	}
	return false
}

func hasAnyPrefix(target string, prefixes []string) bool {
	if target == "" {
		return false
	}
	for _, p := range prefixes {
		if strings.HasPrefix(target, p) {
			return true
		}
	}
	return false
}

func containsAnySubstring(target string, subs []string) bool {
	if target == "" {
		return false
	}
	for _, s := range subs {
		if strings.Contains(target, s) {
			return true
		}
	}
	return false
}

func truncateStr(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
