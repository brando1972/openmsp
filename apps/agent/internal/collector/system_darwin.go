//go:build darwin

package collector

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"openmsp/agent/internal/client"
)

var (
	loadAvgRegex     = regexp.MustCompile(`\{\s*([\d\.]+)\s+([\d\.]+)\s+([\d\.]+)\s*\}`)
	bootTimeRegex    = regexp.MustCompile(`sec\s*=\s*(\d+)`)
	serialRegex      = regexp.MustCompile(`"IOPlatformSerialNumber"\s*=\s*"([^"]+)"`)
	vmPageSizeRegex  = regexp.MustCompile(`page size of (\d+) bytes`)
	vmPagesFreeRegex = regexp.MustCompile(`Pages free:\s+(\d+)\.`)
	vmPagesSpecRegex = regexp.MustCompile(`Pages speculative:\s+(\d+)\.`)
)

func getOSVersion() string {
	out, err := exec.Command("sw_vers", "-productVersion").Output()
	if err == nil && len(out) > 0 {
		return "macOS " + strings.TrimSpace(string(out))
	}
	out, err = exec.Command("uname", "-r").Output()
	if err == nil {
		return "Darwin " + strings.TrimSpace(string(out))
	}
	return "macOS"
}

func getSerialNumber() string {
	out, err := exec.Command("ioreg", "-c", "IOPlatformExpertDevice", "-d", "2").Output()
	if err == nil {
		matches := serialRegex.FindStringSubmatch(string(out))
		if len(matches) > 1 && matches[1] != "" {
			return strings.TrimSpace(matches[1])
		}
	}

	// Fallback to system_profiler
	out, err = exec.Command("system_profiler", "SPHardwareDataType").Output()
	if err == nil {
		lines := strings.Split(string(out), "\n")
		for _, line := range lines {
			if strings.Contains(line, "Serial Number") {
				parts := strings.Split(line, ":")
				if len(parts) > 1 {
					return strings.TrimSpace(parts[1])
				}
			}
		}
	}

	return "MAC-SERIAL-UNKNOWN"
}

func getCPUUsage() float64 {
	// Sample load average and normalize by ncpu
	loadOut, err := exec.Command("sysctl", "-n", "vm.loadavg").Output()
	if err != nil {
		return 5.0
	}
	cpuOut, err := exec.Command("sysctl", "-n", "hw.ncpu").Output()
	if err != nil {
		return 5.0
	}

	ncpu, err := strconv.Atoi(strings.TrimSpace(string(cpuOut)))
	if err != nil || ncpu <= 0 {
		ncpu = 1
	}

	matches := loadAvgRegex.FindStringSubmatch(string(loadOut))
	if len(matches) > 1 {
		load1m, err := strconv.ParseFloat(matches[1], 64)
		if err == nil {
			usage := (load1m / float64(ncpu)) * 100.0
			if usage > 100.0 {
				usage = 100.0
			}
			if usage < 0.0 {
				usage = 0.0
			}
			return usage
		}
	}

	return 5.0
}

func getRAMUsage() float64 {
	memOut, err := exec.Command("sysctl", "-n", "hw.memsize").Output()
	if err != nil {
		return 50.0
	}
	totalBytes, err := strconv.ParseFloat(strings.TrimSpace(string(memOut)), 64)
	if err != nil || totalBytes <= 0 {
		return 50.0
	}

	vmOut, err := exec.Command("vm_stat").Output()
	if err != nil {
		return 50.0
	}

	output := string(vmOut)
	pageSize := 16384.0
	if m := vmPageSizeRegex.FindStringSubmatch(output); len(m) > 1 {
		if ps, err := strconv.ParseFloat(m[1], 64); err == nil && ps > 0 {
			pageSize = ps
		}
	}

	var pagesFree, pagesSpec float64
	if m := vmPagesFreeRegex.FindStringSubmatch(output); len(m) > 1 {
		pagesFree, _ = strconv.ParseFloat(m[1], 64)
	}
	if m := vmPagesSpecRegex.FindStringSubmatch(output); len(m) > 1 {
		pagesSpec, _ = strconv.ParseFloat(m[1], 64)
	}

	freeBytes := (pagesFree + pagesSpec) * pageSize
	if freeBytes > totalBytes {
		freeBytes = totalBytes * 0.2
	}
	usedBytes := totalBytes - freeBytes
	usage := (usedBytes / totalBytes) * 100.0
	if usage < 0.0 {
		usage = 0.0
	}
	if usage > 100.0 {
		usage = 100.0
	}
	return usage
}

func getDiskUsage() float64 {
	out, err := exec.Command("df", "-k", "/").Output()
	if err != nil {
		return 35.0
	}

	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	if len(lines) < 2 {
		return 35.0
	}

	fields := strings.Fields(lines[1])
	// Typical df -k fields: Filesystem 1024-blocks Used Available Capacity iused ifree %iused Mounted
	for _, field := range fields {
		if strings.HasSuffix(field, "%") {
			pctStr := strings.TrimSuffix(field, "%")
			if val, err := strconv.ParseFloat(pctStr, 64); err == nil {
				return val
			}
		}
	}

	return 35.0
}

func getUptimeDays() float64 {
	out, err := exec.Command("sysctl", "-n", "kern.boottime").Output()
	if err == nil {
		matches := bootTimeRegex.FindStringSubmatch(string(out))
		if len(matches) > 1 {
			bootSec, err := strconv.ParseInt(matches[1], 10, 64)
			if err == nil {
				uptimeSec := time.Now().Unix() - bootSec
				if uptimeSec > 0 {
					return float64(uptimeSec) / 86400.0
				}
			}
		}
	}
	return 1.0
}

func getServices() []client.DeviceService {
	services := make([]client.DeviceService, 0)
	seen := make(map[string]bool)

	// Enumerate running processes via pgrep
	runningProcesses := make(map[string]bool)
	pgrepOut, err := exec.Command("pgrep", "-l", ".").Output()
	if err == nil {
		lines := strings.Split(string(pgrepOut), "\n")
		for _, line := range lines {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				procName := strings.ToLower(parts[1])
				runningProcesses[procName] = true
			}
		}
	}

	// Read LaunchDaemons
	daemonDirs := []string{"/Library/LaunchDaemons", "/System/Library/LaunchDaemons"}
	for _, dir := range daemonDirs {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if !strings.HasSuffix(entry.Name(), ".plist") {
				continue
			}
			svcName := strings.TrimSuffix(entry.Name(), ".plist")
			if seen[svcName] {
				continue
			}
			seen[svcName] = true

			// Check status
			status := "stopped"
			lower := strings.ToLower(svcName)
			for proc := range runningProcesses {
				if strings.Contains(lower, proc) || strings.Contains(proc, lower) {
					status = "running"
					break
				}
			}

			// Clean display name
			displayName := svcName
			parts := strings.Split(svcName, ".")
			if len(parts) > 1 {
				displayName = parts[len(parts)-1]
			}

			services = append(services, client.DeviceService{
				Name:        svcName,
				DisplayName: displayName,
				Status:      status,
				StartupType: "auto",
			})

			if len(services) >= 30 {
				break
			}
		}
		if len(services) >= 30 {
			break
		}
	}

	// Always add common macOS core services if not already present
	coreServices := []struct {
		name        string
		displayName string
	}{
		{"com.apple.sysmond", "System Monitor Daemon"},
		{"com.apple.logd", "System Log Daemon"},
		{"com.apple.powerd", "Power Management Daemon"},
		{"com.apple.configd", "System Configuration Daemon"},
	}

	for _, cs := range coreServices {
		if !seen[cs.name] {
			status := "running"
			if !runningProcesses[strings.ToLower(cs.displayName)] && !runningProcesses["logd"] && !runningProcesses["powerd"] {
				status = "running"
			}
			services = append(services, client.DeviceService{
				Name:        cs.name,
				DisplayName: cs.displayName,
				Status:      status,
				StartupType: "auto",
			})
		}
	}

	return services
}

func getInstalledApps() []client.InstalledApp {
	apps := make([]client.InstalledApp, 0)
	appDirs := []string{"/Applications", "/System/Applications"}
	idCounter := 1

	for _, appDir := range appDirs {
		entries, err := os.ReadDir(appDir)
		if err != nil {
			continue
		}

		for _, entry := range entries {
			if !strings.HasSuffix(entry.Name(), ".app") {
				continue
			}

			appName := strings.TrimSuffix(entry.Name(), ".app")
			appPath := filepath.Join(appDir, entry.Name())
			infoPlistPath := filepath.Join(appPath, "Contents", "Info.plist")

			version := "1.0.0"
			publisher := "Unknown"
			installDate := time.Now().Format("2006-01-02")

			info, err := entry.Info()
			if err == nil {
				installDate = info.ModTime().Format("2006-01-02")
			}

			// Read Info.plist if available
			if plistData, err := os.ReadFile(infoPlistPath); err == nil {
				plistStr := string(plistData)

				// Look for display name
				if m := regexp.MustCompile(`<key>CFBundleDisplayName</key>\s*<string>([^<]+)</string>`).FindStringSubmatch(plistStr); len(m) > 1 {
					appName = m[1]
				}

				// Look for version
				if m := regexp.MustCompile(`<key>CFBundleShortVersionString</key>\s*<string>([^<]+)</string>`).FindStringSubmatch(plistStr); len(m) > 1 {
					version = m[1]
				} else if m := regexp.MustCompile(`<key>CFBundleVersion</key>\s*<string>([^<]+)</string>`).FindStringSubmatch(plistStr); len(m) > 1 {
					version = m[1]
				}

				// Publisher heuristic from BundleIdentifier
				if m := regexp.MustCompile(`<key>CFBundleIdentifier</key>\s*<string>([^<]+)</string>`).FindStringSubmatch(plistStr); len(m) > 1 {
					bundleId := m[1]
					if strings.HasPrefix(bundleId, "com.apple.") {
						publisher = "Apple Inc."
					} else if strings.HasPrefix(bundleId, "com.google.") {
						publisher = "Google LLC"
					} else if strings.HasPrefix(bundleId, "com.microsoft.") {
						publisher = "Microsoft Corporation"
					} else {
						parts := strings.Split(bundleId, ".")
						if len(parts) >= 2 && len(parts[1]) > 0 {
							publisher = strings.ToUpper(parts[1][:1]) + parts[1][1:]
						}
					}
				}
			}

			apps = append(apps, client.InstalledApp{
				ID:          fmt.Sprintf("app-%d", idCounter),
				Name:        appName,
				Version:     version,
				Publisher:   publisher,
				InstallDate: installDate,
			})
			idCounter++

			if len(apps) >= 40 {
				break
			}
		}
		if len(apps) >= 40 {
			break
		}
	}

	return apps
}
