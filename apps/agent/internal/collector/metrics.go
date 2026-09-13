package collector

import (
	"runtime"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/mem"
)

// Cross-platform metric collection via gopsutil. These are the primary source;
// the per-OS native functions (getCPUUsage, etc.) remain as fallbacks in
// CollectMetrics when gopsutil returns nothing usable.

// psCPUPercent samples CPU utilization over a short interval.
func psCPUPercent() (float64, bool) {
	pcts, err := cpu.Percent(300*time.Millisecond, false)
	if err != nil || len(pcts) == 0 {
		return 0, false
	}
	return pcts[0], true
}

// psRAMPercent returns used RAM as a percentage of total.
func psRAMPercent() (float64, bool) {
	vm, err := mem.VirtualMemory()
	if err != nil || vm == nil || vm.Total == 0 {
		return 0, false
	}
	return vm.UsedPercent, true
}

// psDiskPercent returns used space on the primary/root volume as a percentage.
func psDiskPercent() (float64, bool) {
	path := "/"
	if runtime.GOOS == "windows" {
		path = "C:\\"
	}
	u, err := disk.Usage(path)
	if err != nil || u == nil || u.Total == 0 {
		return 0, false
	}
	return u.UsedPercent, true
}

// psUptimeDays returns host uptime in days.
func psUptimeDays() (float64, bool) {
	secs, err := host.Uptime()
	if err != nil || secs == 0 {
		return 0, false
	}
	return float64(secs) / 86400.0, true
}
