package netscan

import "strings"

// classify infers a device role from the signals gathered about a host. SNMP
// sysDescr (when present) is the strongest signal, then service/port/vendor hints.
func classify(h *Host) string {
	ports := map[int]bool{}
	for _, p := range h.OpenPorts {
		ports[p] = true
	}
	svc := strings.ToLower(strings.Join(h.Services, " "))
	vendor := strings.ToLower(h.Vendor)
	descr := strings.ToLower(h.SysDescr + " " + h.Model)

	has := func(needles ...string) bool {
		for _, n := range needles {
			if strings.Contains(descr, n) || strings.Contains(svc, n) {
				return true
			}
		}
		return false
	}

	// Infrastructure (SNMP descr is authoritative).
	if has("router", "gateway", "edgeos", "routeros", "pfsense", "fortigate", "internetgatewaydevice") {
		return "router"
	}
	if has("switch", "switching", "catalyst", "procurve", "aruba", "nexus") {
		return "switch"
	}
	if has("access point", "accesspoint", "wireless", "unifi ap", "wifi") {
		return "ap"
	}

	// Printers
	if ports[9100] || ports[515] || ports[631] || strings.Contains(svc, "_ipp") || strings.Contains(svc, "_printer") || strings.Contains(svc, "_pdl") ||
		containsAny(vendor, "brother", "epson", "canon", "xerox", "ricoh") || strings.Contains(vendor, "hp") && ports[9100] {
		return "printer"
	}

	// Cameras / NVR
	if ports[554] || ports[8000] || containsAny(vendor, "hikvision", "dahua", "axis") {
		return "camera"
	}

	// NAS
	if containsAny(vendor, "synology", "qnap") || ((ports[5000] || ports[5001]) && ports[445]) {
		return "nas"
	}

	// Networking vendor without a role signal ⇒ likely infra
	if containsAny(vendor, "cisco", "ubiquiti", "aruba", "netgear", "tp-link", "meraki") {
		return "switch"
	}

	// Workstations / servers
	if ports[3389] || ports[445] || ports[139] || containsAny(vendor, "dell", "lenovo", "vmware", "virtualbox", "parallels", "microsoft", "qemu") {
		return "workstation"
	}

	// Phones / streamers / IoT
	if containsAny(vendor, "apple", "samsung", "google", "amazon") || strings.Contains(svc, "_airplay") || strings.Contains(svc, "_googlecast") {
		return "iot"
	}

	return "unknown"
}

func containsAny(hay string, needles ...string) bool {
	for _, n := range needles {
		if strings.Contains(hay, n) {
			return true
		}
	}
	return false
}
