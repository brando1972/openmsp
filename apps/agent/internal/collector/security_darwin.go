//go:build darwin

package collector

import (
	"context"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"openmsp/agent/internal/client"
)

// runShort runs a command with a short timeout and returns trimmed stdout.
func runShort(name string, args ...string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, name, args...).Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// getSecurityPosture reports macOS endpoint security state.
func getSecurityPosture() client.SecurityPosture {
	sp := client.SecurityPosture{
		DiskEncryption: "unknown",
		PendingUpdates: -1, // softwareupdate -l is slow/networked; collected on demand, not per-heartbeat
	}

	// FileVault
	switch fv := runShort("fdesetup", "status"); {
	case strings.Contains(fv, "FileVault is On"):
		sp.DiskEncryption = "on"
	case strings.Contains(fv, "FileVault is Off"):
		sp.DiskEncryption = "off"
	}

	// System Integrity Protection
	if sip := runShort("csrutil", "status"); strings.Contains(strings.ToLower(sip), "enabled") {
		sp.SIPEnabled = true
	}

	// Application firewall (0 = off, 1/2 = on)
	if fw := runShort("/usr/libexec/ApplicationFirewall/socketfilterfw", "--getglobalstate"); fw != "" {
		sp.FirewallOn = !strings.Contains(fw, "disabled")
	} else if st := runShort("defaults", "read", "/Library/Preferences/com.apple.alf", "globalstate"); st != "" {
		sp.FirewallOn = st != "0"
	}

	// Gatekeeper
	if gk := runShort("spctl", "--status"); strings.Contains(gk, "assessments enabled") {
		sp.Gatekeeper = true
	}

	// Hardware model
	sp.Model = runShort("sysctl", "-n", "hw.model")

	return sp
}

// getBattery reports charge/health via pmset (+ ioreg for cycle count).
// Returns nil on machines without a battery.
func getBattery() *client.Battery {
	out := runShort("pmset", "-g", "batt")
	if out == "" || !strings.Contains(out, "%") {
		return nil
	}

	b := &client.Battery{}
	// Example line: " -InternalBattery-0 (id=...)	87%; discharging; 4:12 remaining present: true"
	for _, tok := range strings.Split(out, ";") {
		tok = strings.TrimSpace(tok)
		if strings.HasSuffix(tok, "%") || strings.Contains(tok, "%") {
			if idx := strings.Index(tok, "%"); idx > 0 {
				start := strings.LastIndexAny(tok[:idx], " \t")
				numStr := strings.TrimSpace(tok[start+1 : idx])
				if v, err := strconv.ParseFloat(numStr, 64); err == nil {
					b.Percent = v
				}
			}
		}
		if strings.Contains(tok, "charging") && !strings.Contains(tok, "discharging") {
			b.Charging = true
		}
		if strings.Contains(tok, "charged") {
			b.Charging = false
		}
	}

	// Cycle count from ioreg
	if io := runShort("ioreg", "-r", "-c", "AppleSmartBattery"); io != "" {
		for _, line := range strings.Split(io, "\n") {
			if strings.Contains(line, "\"CycleCount\"") {
				if eq := strings.LastIndex(line, "="); eq >= 0 {
					if v, err := strconv.Atoi(strings.TrimSpace(line[eq+1:])); err == nil {
						b.CycleCount = v
					}
				}
			}
		}
	}

	return b
}
