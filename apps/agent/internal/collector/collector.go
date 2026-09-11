package collector

import (
	"net"
	"os"
	"runtime"
	"strings"
	"time"

	"openmsp/agent/internal/client"
)

// SystemInfo encapsulates host identity information for enrollment.
type SystemInfo struct {
	Hostname     string
	OS           string
	OSVersion    string
	SerialNumber string
	MACAddress   string
	IPAddress    string
}

// GetSystemInfo retrieves host identification for agent enrollment.
func GetSystemInfo() SystemInfo {
	hostname, err := os.Hostname()
	if err != nil || hostname == "" {
		hostname = "unknown-host"
	}

	osName := normalizeOS(runtime.GOOS)
	osVersion := getOSVersion()
	serial := getSerialNumber()

	mac, ip := GetPrimaryNetworkInterface()

	return SystemInfo{
		Hostname:     hostname,
		OS:           osName,
		OSVersion:    osVersion,
		SerialNumber: serial,
		MACAddress:   mac,
		IPAddress:    ip,
	}
}

// CollectMetrics gathers current CPU, RAM, Disk, and Uptime metrics.
func CollectMetrics() (client.DeviceMetric, error) {
	cpu := getCPUUsage()
	ram := getRAMUsage()
	disk := getDiskUsage()
	uptime := getUptimeDays()

	return client.DeviceMetric{
		CpuUsage:   round(cpu, 1),
		RamUsage:   round(ram, 1),
		DiskUsage:  round(disk, 1),
		UptimeDays: round(uptime, 2),
		LastSeen:   time.Now().UTC().Format(time.RFC3339),
	}, nil
}

// CollectNetwork retrieves primary local network identifiers.
func CollectNetwork() client.NetworkInfo {
	mac, ip := GetPrimaryNetworkInterface()
	return client.NetworkInfo{
		IPAddress:  ip,
		MACAddress: mac,
	}
}

// CollectServices enumerates host services and their statuses.
func CollectServices() []client.DeviceService {
	return getServices()
}

// CollectInstalledApps enumerates installed software packages.
func CollectInstalledApps() []client.InstalledApp {
	return getInstalledApps()
}

// GetPrimaryNetworkInterface finds the first active non-loopback network interface with an IPv4 address.
func GetPrimaryNetworkInterface() (macAddr string, ipAddr string) {
	macAddr = "00:00:00:00:00:00"
	ipAddr = "127.0.0.1"

	interfaces, err := net.Interfaces()
	if err != nil {
		return macAddr, ipAddr
	}

	for _, iface := range interfaces {
		// Ignore down or loopback interfaces
		if iface.Flags&net.FlagLoopback != 0 || iface.Flags&net.FlagUp == 0 {
			continue
		}

		mac := iface.HardwareAddr.String()
		if mac == "" {
			continue
		}

		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}

		for _, addr := range addrs {
			ipNet, ok := addr.(*net.IPNet)
			if !ok {
				continue
			}
			ip := ipNet.IP.To4()
			if ip != nil && !ip.IsLoopback() {
				return mac, ip.String()
			}
		}

		if macAddr == "00:00:00:00:00:00" && mac != "" {
			macAddr = mac
		}
	}

	return macAddr, ipAddr
}

func normalizeOS(goos string) string {
	switch goos {
	case "darwin":
		return "macos"
	case "windows":
		return "windows"
	case "linux":
		return "linux"
	default:
		return strings.ToLower(goos)
	}
}

func round(val float64, precision int) float64 {
	p := 1.0
	for i := 0; i < precision; i++ {
		p *= 10.0
	}
	return float64(int(val*p+0.5)) / p
}
