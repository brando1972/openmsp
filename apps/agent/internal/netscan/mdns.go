package netscan

import (
	"net"
	"strings"
	"time"
)

// mdnsResult maps a responder IP to the service labels seen in its mDNS replies.
type mdnsResult map[string][]string

// discoverMDNS multicasts a service-enumeration query and collects responders.
// It parses service-type labels (e.g. "_ipp._tcp", "_airplay._tcp") heuristically
// from the raw packets — enough to classify device roles without a full DNS
// decoder. Dependency-free (stdlib UDP only).
func discoverMDNS(timeout time.Duration) mdnsResult {
	out := mdnsResult{}
	addr := &net.UDPAddr{IP: net.ParseIP("224.0.0.251"), Port: 5353}
	conn, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.IPv4zero, Port: 0})
	if err != nil {
		return out
	}
	defer conn.Close()

	// Query PTR for the service-enumeration meta-query.
	q := buildMDNSQuery("_services._dns-sd._udp.local")
	_, _ = conn.WriteToUDP(q, addr)
	// Also directly probe common service types to coax replies from devices that
	// don't answer the meta-query.
	for _, svc := range []string{"_ipp._tcp.local", "_printer._tcp.local", "_airplay._tcp.local", "_googlecast._tcp.local", "_smb._tcp.local", "_rfb._tcp.local", "_ssh._tcp.local"} {
		_, _ = conn.WriteToUDP(buildMDNSQuery(svc), addr)
	}

	_ = conn.SetReadDeadline(time.Now().Add(timeout))
	buf := make([]byte, 9000)
	for {
		n, src, err := conn.ReadFromUDP(buf)
		if err != nil {
			break
		}
		ip := src.IP.To4()
		if ip == nil {
			continue
		}
		svcs := extractServiceLabels(buf[:n])
		if len(svcs) > 0 {
			out[ip.String()] = mergeUnique(out[ip.String()], svcs)
		} else {
			if _, ok := out[ip.String()]; !ok {
				out[ip.String()] = nil // responder, no parsed label
			}
		}
	}
	return out
}

// buildMDNSQuery builds a minimal DNS query packet for a PTR record of name.
func buildMDNSQuery(name string) []byte {
	var b []byte
	// header: id=0, flags=0 (standard query), qd=1
	b = append(b, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00)
	for _, label := range strings.Split(name, ".") {
		if label == "" {
			continue
		}
		b = append(b, byte(len(label)))
		b = append(b, []byte(label)...)
	}
	b = append(b, 0x00)             // end of name
	b = append(b, 0x00, 0x0c)       // QTYPE = PTR
	b = append(b, 0x00, 0x01)       // QCLASS = IN
	return b
}

// extractServiceLabels heuristically pulls "_service._proto" tokens out of a raw
// mDNS packet by reconstructing printable label runs.
func extractServiceLabels(pkt []byte) []string {
	var tokens []string
	var cur strings.Builder
	flush := func() {
		s := cur.String()
		cur.Reset()
		if strings.HasPrefix(s, "_") && (strings.Contains(s, "_tcp") || strings.Contains(s, "_udp")) {
			tokens = append(tokens, s)
		}
	}
	for _, c := range pkt {
		if c == '_' || c == '-' || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') {
			cur.WriteByte(c)
		} else if c == 0x04 || c == 0x03 { // label-length bytes for "_tcp"/"_udp"/"local"
			cur.WriteByte('.')
		} else {
			flush()
		}
	}
	flush()
	// normalize e.g. "_ipp._tcp" (strip trailing .local)
	seen := map[string]bool{}
	var out []string
	for _, t := range tokens {
		t = strings.TrimSuffix(t, ".local")
		t = strings.TrimSuffix(t, ".")
		if t != "" && !seen[t] {
			seen[t] = true
			out = append(out, t)
		}
	}
	return out
}

func mergeUnique(a, b []string) []string {
	seen := map[string]bool{}
	for _, x := range a {
		seen[x] = true
	}
	for _, x := range b {
		if !seen[x] {
			seen[x] = true
			a = append(a, x)
		}
	}
	return a
}
