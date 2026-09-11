//go:build !darwin && !linux && !windows

package collector

import (
	"openmsp/agent/internal/client"
)

func getOSVersion() string {
	return "Generic OS"
}

func getSerialNumber() string {
	return "GENERIC-SERIAL-001"
}

func getCPUUsage() float64 {
	return 10.0
}

func getRAMUsage() float64 {
	return 40.0
}

func getDiskUsage() float64 {
	return 30.0
}

func getUptimeDays() float64 {
	return 1.0
}

func getServices() []client.DeviceService {
	return []client.DeviceService{
		{Name: "syslogd", DisplayName: "System Logger", Status: "running", StartupType: "auto"},
	}
}

func getInstalledApps() []client.InstalledApp {
	return []client.InstalledApp{
		{ID: "app-1", Name: "Base System", Version: "1.0", Publisher: "OS Vendor", InstallDate: "2025-01-01"},
	}
}
