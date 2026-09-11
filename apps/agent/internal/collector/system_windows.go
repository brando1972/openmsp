//go:build windows

package collector

import (
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"openmsp/agent/internal/client"
)

func runPowerShell(cmd string) string {
	out, err := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", cmd).Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func getOSVersion() string {
	val := runPowerShell("(Get-CimInstance Win32_OperatingSystem).Caption")
	if val != "" {
		return val
	}
	out, err := exec.Command("cmd.exe", "/c", "ver").Output()
	if err == nil && len(out) > 0 {
		return strings.TrimSpace(string(out))
	}
	return "Windows"
}

func getSerialNumber() string {
	val := runPowerShell("(Get-CimInstance Win32_BIOS).SerialNumber")
	if val != "" && val != "To be filled by O.E.M." {
		return val
	}
	return "WIN-SERIAL-UNKNOWN"
}

func getCPUUsage() float64 {
	val := runPowerShell("(Get-CimInstance Win32_Processor).LoadPercentage")
	if val != "" {
		if pct, err := strconv.ParseFloat(val, 64); err == nil {
			return pct
		}
	}
	return 10.0
}

func getRAMUsage() float64 {
	val := runPowerShell("$os = Get-CimInstance Win32_OperatingSystem; [math]::Round((($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize) * 100, 1)")
	if val != "" {
		if pct, err := strconv.ParseFloat(val, 64); err == nil {
			return pct
		}
	}
	return 50.0
}

func getDiskUsage() float64 {
	val := runPowerShell("$d = Get-PSDrive C; [math]::Round(($d.Used / ($d.Used + $d.Free)) * 100, 1)")
	if val != "" {
		if pct, err := strconv.ParseFloat(val, 64); err == nil {
			return pct
		}
	}
	return 40.0
}

func getUptimeDays() float64 {
	val := runPowerShell("((Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime).TotalDays")
	if val != "" {
		if days, err := strconv.ParseFloat(val, 64); err == nil {
			return days
		}
	}
	return 1.0
}

func getServices() []client.DeviceService {
	services := make([]client.DeviceService, 0)
	raw := runPowerShell("Get-Service | Select-Object -First 25 | ForEach-Object { \"$($_.Name)|$($_.DisplayName)|$($_.Status)|$($_.StartType)\" }")
	if raw != "" {
		lines := strings.Split(raw, "\n")
		for _, line := range lines {
			parts := strings.Split(strings.TrimSpace(line), "|")
			if len(parts) >= 3 {
				status := "running"
				if strings.ToLower(parts[2]) == "stopped" {
					status = "stopped"
				}
				startup := "auto"
				if len(parts) >= 4 && strings.ToLower(parts[3]) != "automatic" {
					startup = "manual"
				}
				services = append(services, client.DeviceService{
					Name:        parts[0],
					DisplayName: parts[1],
					Status:      status,
					StartupType: startup,
				})
			}
		}
	}

	if len(services) == 0 {
		services = append(services,
			client.DeviceService{Name: "Spooler", DisplayName: "Print Spooler", Status: "running", StartupType: "auto"},
			client.DeviceService{Name: "wuauserv", DisplayName: "Windows Update", Status: "running", StartupType: "auto"},
		)
	}

	return services
}

func getInstalledApps() []client.InstalledApp {
	apps := make([]client.InstalledApp, 0)
	raw := runPowerShell("Get-ItemProperty HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* | Where-Object { $_.DisplayName } | Select-Object -First 25 | ForEach-Object { \"$($_.DisplayName)|$($_.DisplayVersion)|$($_.Publisher)|$($_.InstallDate)\" }")
	idCounter := 1
	if raw != "" {
		lines := strings.Split(raw, "\n")
		for _, line := range lines {
			parts := strings.Split(strings.TrimSpace(line), "|")
			if len(parts) >= 3 && parts[0] != "" {
				name := parts[0]
				version := parts[1]
				if version == "" {
					version = "1.0.0"
				}
				publisher := parts[2]
				if publisher == "" {
					publisher = "Unknown"
				}
				installDate := time.Now().Format("2006-01-02")
				if len(parts) >= 4 && parts[3] != "" {
					installDate = parts[3]
				}
				apps = append(apps, client.InstalledApp{
					ID:          fmt.Sprintf("app-%d", idCounter),
					Name:        name,
					Version:     version,
					Publisher:   publisher,
					InstallDate: installDate,
				})
				idCounter++
			}
		}
	}
	return apps
}
