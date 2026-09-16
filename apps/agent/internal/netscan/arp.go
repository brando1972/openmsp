package netscan

import (
	"bufio"
	"net"
	"os"
	"os/exec"
	"runtime"
	"strings"
)

// localPrefixes returns the IPv4 CIDRs the host is directly attached to
// (non-loopback, interface up). These are the subnets a collector scans.
func localPrefixes() []string {
	var out []string
	seen := map[string]bool{}
	ifaces, err := net.Interfaces()
	if err != nil {
		return out
	}
	for _, iface := range ifaces {
		if iface.Flags&net.FlagLoopback != 0 || iface.Flags&net.FlagUp == 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, a := range addrs {
			ipnet, ok := a.(*net.IPNet)
			if !ok || ipnet.IP.To4() == nil || ipnet.IP.IsLoopback() {
				continue
			}
			// Skip huge prefixes to avoid scanning the world; cap at /22.
			ones, _ := ipnet.Mask.Size()
			if ones < 22 {
				continue
			}
			cidr := ipnet.String()
			if !seen[cidr] {
				seen[cidr] = true
				out = append(out, cidr)
			}
		}
	}
	return out
}

// arpCache reads the OS ARP/neighbor table into an ip→mac map.
func arpCache() map[string]string {
	switch runtime.GOOS {
	case "linux":
		return arpCacheLinux()
	default:
		return arpCacheCmd()
	}
}

// arpCacheLinux parses /proc/net/arp.
func arpCacheLinux() map[string]string {
	out := map[string]string{}
	f, err := os.Open("/proc/net/arp")
	if err != nil {
		return arpCacheCmd()
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	first := true
	for sc.Scan() {
		if first { // header row
			first = false
			continue
		}
		fields := strings.Fields(sc.Text())
		if len(fields) < 4 {
			continue
		}
		ip, mac := fields[0], fields[3]
		if mac == "00:00:00:00:00:00" || mac == "" {
			continue
		}
		out[ip] = strings.ToLower(mac)
	}
	return out
}

// arpCacheCmd parses `arp -a` output (macOS / Windows / BSD fallback).
// macOS/BSD: "? (192.168.1.1) at ab:cd:ef:12:34:56 on en0 ..."
// Windows:   "  192.168.1.1           ab-cd-ef-12-34-56     dynamic"
func arpCacheCmd() map[string]string {
	out := map[string]string{}
	data, err := exec.Command("arp", "-a").Output()
	if err != nil {
		return out
	}
	for _, line := range strings.Split(string(data), "\n") {
		ip, mac := parseArpLine(line)
		if ip != "" && mac != "" {
			out[ip] = mac
		}
	}
	return out
}

func parseArpLine(line string) (ip, mac string) {
	fields := strings.Fields(line)
	for _, f := range fields {
		f = strings.Trim(f, "()")
		if ip == "" && net.ParseIP(f) != nil && strings.Contains(f, ".") {
			ip = f
			continue
		}
		if mac == "" && looksLikeMAC(f) {
			mac = normalizeMAC(f)
		}
	}
	return ip, mac
}

func looksLikeMAC(s string) bool {
	c := strings.NewReplacer(":", "", "-", "", ".", "").Replace(s)
	if len(c) != 12 {
		return false
	}
	for _, r := range c {
		if !((r >= '0' && r <= '9') || (r >= 'a' && r <= 'f') || (r >= 'A' && r <= 'F')) {
			return false
		}
	}
	return true
}

// normalizeMAC returns a lowercase colon-separated MAC.
func normalizeMAC(s string) string {
	c := strings.ToLower(strings.NewReplacer(":", "", "-", "", ".", "").Replace(s))
	if len(c) != 12 {
		return strings.ToLower(s)
	}
	var b strings.Builder
	for i := 0; i < 12; i += 2 {
		if i > 0 {
			b.WriteByte(':')
		}
		b.WriteString(c[i : i+2])
	}
	return b.String()
}
