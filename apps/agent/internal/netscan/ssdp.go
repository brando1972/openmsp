package netscan

import (
	"net"
	"strings"
	"time"
)

// ssdpInfo is what an SSDP responder told us about itself.
type ssdpInfo struct {
	Server string   // "Server:" header (often "OS/ver UPnP/1.0 product/ver")
	STs    []string // search-target / device types seen
}

// discoverSSDP multicasts an M-SEARCH and collects UPnP responders: smart TVs,
// media servers, routers, cameras, IoT. Stdlib UDP only.
func discoverSSDP(timeout time.Duration) map[string]*ssdpInfo {
	out := map[string]*ssdpInfo{}
	mcast := &net.UDPAddr{IP: net.ParseIP("239.255.255.250"), Port: 1900}
	conn, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.IPv4zero, Port: 0})
	if err != nil {
		return out
	}
	defer conn.Close()

	msg := "M-SEARCH * HTTP/1.1\r\n" +
		"HOST: 239.255.255.250:1900\r\n" +
		"MAN: \"ssdp:discover\"\r\n" +
		"MX: 2\r\n" +
		"ST: ssdp:all\r\n\r\n"
	_, _ = conn.WriteToUDP([]byte(msg), mcast)

	_ = conn.SetReadDeadline(time.Now().Add(timeout))
	buf := make([]byte, 4096)
	for {
		n, src, err := conn.ReadFromUDP(buf)
		if err != nil {
			break
		}
		ip := src.IP.To4()
		if ip == nil {
			continue
		}
		server, st := parseSSDP(string(buf[:n]))
		info := out[ip.String()]
		if info == nil {
			info = &ssdpInfo{}
			out[ip.String()] = info
		}
		if server != "" && info.Server == "" {
			info.Server = server
		}
		if st != "" {
			info.STs = mergeUnique(info.STs, []string{st})
		}
	}
	return out
}

func parseSSDP(resp string) (server, st string) {
	for _, line := range strings.Split(resp, "\n") {
		line = strings.TrimRight(line, "\r")
		lower := strings.ToLower(line)
		switch {
		case strings.HasPrefix(lower, "server:"):
			server = strings.TrimSpace(line[len("server:"):])
		case strings.HasPrefix(lower, "st:"):
			st = strings.TrimSpace(line[len("st:"):])
		case strings.HasPrefix(lower, "nt:") && st == "":
			st = strings.TrimSpace(line[len("nt:"):])
		}
	}
	return server, st
}
