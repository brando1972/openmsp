package netscan

import (
	"fmt"
	"net"
	"sort"
	"time"
)

// hostsInPrefix expands a CIDR into its usable host IPs (IPv4 only), capped to
// avoid scanning oversized prefixes. Network and broadcast addresses are skipped.
func hostsInPrefix(cidr string) []net.IP {
	_, ipnet, err := net.ParseCIDR(cidr)
	if err != nil || ipnet.IP.To4() == nil {
		return nil
	}
	ones, bits := ipnet.Mask.Size()
	total := 1 << uint(bits-ones)
	if total > 4096 { // hard cap (~ /20)
		total = 4096
	}
	var ips []net.IP
	ip := ipnet.IP.Mask(ipnet.Mask).To4()
	base := make(net.IP, 4)
	copy(base, ip)
	for i := 1; i < total-1; i++ { // skip network (.0) and broadcast (last)
		cur := make(net.IP, 4)
		copy(cur, base)
		v := uint32(cur[0])<<24 | uint32(cur[1])<<16 | uint32(cur[2])<<8 | uint32(cur[3])
		v += uint32(i)
		cur[0], cur[1], cur[2], cur[3] = byte(v>>24), byte(v>>16), byte(v>>8), byte(v)
		if !ipnet.Contains(cur) {
			break
		}
		ips = append(ips, cur)
	}
	return ips
}

// probeResult is what a single-host TCP probe returns.
type probeResult struct {
	IP        string
	Alive     bool
	OpenPorts []int
	LatencyMs float64
}

// probeHost TCP-connects to each candidate port. A successful (or refused)
// connection proves the host is alive and also primes the ARP cache. Open ports
// feed role classification and tunnel affordances. Latency is the first
// successful connect time.
func probeHost(ip string, ports []int, timeout time.Duration) probeResult {
	res := probeResult{IP: ip}
	for _, p := range ports {
		start := time.Now()
		conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", ip, p), timeout)
		if err == nil {
			res.Alive = true
			res.OpenPorts = append(res.OpenPorts, p)
			if res.LatencyMs == 0 {
				res.LatencyMs = round(float64(time.Since(start).Microseconds())/1000.0, 1)
			}
			conn.Close()
			continue
		}
		// A "connection refused" still proves liveness even with no open port.
		if isRefused(err) {
			res.Alive = true
		}
	}
	sort.Ints(res.OpenPorts)
	return res
}

// reverseDNS returns the first PTR hostname for an IP, trimmed of the trailing dot.
func reverseDNS(ip string, timeout time.Duration) string {
	r := &net.Resolver{}
	ctx, cancel := contextWithTimeout(timeout)
	defer cancel()
	names, err := r.LookupAddr(ctx, ip)
	if err != nil || len(names) == 0 {
		return ""
	}
	name := names[0]
	if n := len(name); n > 0 && name[n-1] == '.' {
		name = name[:n-1]
	}
	return name
}
