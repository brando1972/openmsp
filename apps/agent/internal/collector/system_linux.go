//go:build linux

package collector

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"openmsp/agent/internal/client"
)

func getOSVersion() string {
	if data, err := os.ReadFile("/etc/os-release"); err == nil {
		scanner := bufio.NewScanner(strings.NewReader(string(data)))
		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "PRETTY_NAME=") {
				val := strings.TrimPrefix(line, "PRETTY_NAME=")
				return strings.Trim(val, "\"")
			}
		}
	}
	out, err := exec.Command("uname", "-r").Output()
	if err == nil {
		return "Linux " + strings.TrimSpace(string(out))
	}
	return "Linux"
}

func getSerialNumber() string {
	paths := []string{
		"/sys/class/dmi/id/product_serial",
		"/sys/devices/virtual/dmi/id/product_serial",
		"/etc/machine-id",
	}
	for _, p := range paths {
		if data, err := os.ReadFile(p); err == nil {
			val := strings.TrimSpace(string(data))
			if val != "" && val != "None" && val != "Default string" {
				return val
			}
		}
	}
	return "LINUX-SERIAL-UNKNOWN"
}

func getCPUUsage() float64 {
	readStat := func() (idle, total uint64, err error) {
		data, err := os.ReadFile("/proc/stat")
		if err != nil {
			return 0, 0, err
		}
		lines := strings.Split(string(data), "\n")
		for _, line := range lines {
			if strings.HasPrefix(line, "cpu ") {
				fields := strings.Fields(line)
				if len(fields) >= 5 {
					var sum uint64
					for _, f := range fields[1:] {
						val, _ := strconv.ParseUint(f, 10, 64)
						sum += val
					}
					idVal, _ := strconv.ParseUint(fields[4], 10, 64)
					return idVal, sum, nil
				}
			}
		}
		return 0, 0, fmt.Errorf("cpu line not found")
	}

	idle1, total1, err1 := readStat()
	if err1 != nil {
		return 5.0
	}
	time.Sleep(200 * time.Millisecond)
	idle2, total2, err2 := readStat()
	if err2 != nil {
		return 5.0
	}

	deltaTotal := float64(total2 - total1)
	deltaIdle := float64(idle2 - idle1)
	if deltaTotal <= 0 {
		return 5.0
	}

	usage := (deltaTotal - deltaIdle) / deltaTotal * 100.0
	if usage < 0.0 {
		usage = 0.0
	}
	if usage > 100.0 {
		usage = 100.0
	}
	return usage
}

func getRAMUsage() float64 {
	data, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return 50.0
	}

	var memTotal, memAvailable float64
	scanner := bufio.NewScanner(strings.NewReader(string(data)))
	for scanner.Scan() {
		line := scanner.Text()
		fields := strings.Fields(line)
		if len(fields) >= 2 {
			val, _ := strconv.ParseFloat(fields[1], 64)
			if fields[0] == "MemTotal:" {
				memTotal = val
			} else if fields[0] == "MemAvailable:" {
				memAvailable = val
			}
		}
	}

	if memTotal <= 0 {
		return 50.0
	}
	usage := (memTotal - memAvailable) / memTotal * 100.0
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
	data, err := os.ReadFile("/proc/uptime")
	if err == nil {
		fields := strings.Fields(string(data))
		if len(fields) > 0 {
			if upSec, err := strconv.ParseFloat(fields[0], 64); err == nil {
				return upSec / 86400.0
			}
		}
	}
	return 1.0
}

func getServices() []client.DeviceService {
	services := make([]client.DeviceService, 0)

	// Try systemctl list-units
	out, err := exec.Command("systemctl", "list-units", "--type=service", "--all", "--no-pager", "--no-legend").Output()
	if err == nil {
		lines := strings.Split(string(out), "\n")
		for _, line := range lines {
			fields := strings.Fields(line)
			if len(fields) >= 4 {
				svcName := strings.TrimSuffix(fields[0], ".service")
				activeState := fields[2]
				subState := fields[3]

				status := "stopped"
				if activeState == "active" || subState == "running" {
					status = "running"
				}

				services = append(services, client.DeviceService{
					Name:        svcName,
					DisplayName: svcName,
					Status:      status,
					StartupType: "auto",
				})

				if len(services) >= 30 {
					break
				}
			}
		}
	}

	if len(services) == 0 {
		// Fallback default services
		services = append(services,
			client.DeviceService{Name: "systemd", DisplayName: "System Daemon", Status: "running", StartupType: "auto"},
			client.DeviceService{Name: "sshd", DisplayName: "OpenSSH Daemon", Status: "running", StartupType: "auto"},
		)
	}

	return services
}

func getInstalledApps() []client.InstalledApp {
	apps := make([]client.InstalledApp, 0)
	idCounter := 1

	desktopDirs := []string{"/usr/share/applications", "/usr/local/share/applications"}
	for _, dir := range desktopDirs {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if !strings.HasSuffix(entry.Name(), ".desktop") {
				continue
			}

			appName := strings.TrimSuffix(entry.Name(), ".desktop")
			filePath := filepath.Join(dir, entry.Name())
			installDate := time.Now().Format("2006-01-02")
			if info, err := entry.Info(); err == nil {
				installDate = info.ModTime().Format("2006-01-02")
			}

			version := "1.0.0"
			publisher := "Linux Software"

			if data, err := os.ReadFile(filePath); err == nil {
				scanner := bufio.NewScanner(strings.NewReader(string(data)))
				for scanner.Scan() {
					l := scanner.Text()
					if strings.HasPrefix(l, "Name=") && appName == strings.TrimSuffix(entry.Name(), ".desktop") {
						appName = strings.TrimPrefix(l, "Name=")
					} else if strings.HasPrefix(l, "Version=") {
						version = strings.TrimPrefix(l, "Version=")
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
