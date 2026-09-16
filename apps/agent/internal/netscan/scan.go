package netscan

import (
	"sync"
	"time"
)

// Scan runs one discovery pass and returns the collected inventory + topology.
// It is safe to call on any platform; privileged paths (raw ARP/ICMP) degrade to
// the ARP cache + TCP-connect liveness when unprivileged.
func Scan(opts Options) Result {
	start := time.Now()
	applyDefaults(&opts)

	prefixes := opts.Prefixes
	if len(prefixes) == 0 {
		prefixes = localPrefixes()
	}

	// hosts keyed by MAC (fallback: "ip:"+ip when MAC unknown).
	hosts := map[string]*Host{}
	var mu sync.Mutex

	upsert := func(ip, mac, source string) *Host {
		mu.Lock()
		defer mu.Unlock()
		key := "ip:" + ip
		if mac != "" {
			key = mac
		}
		h := hosts[key]
		if h == nil {
			h = &Host{MAC: mac, LastSeen: time.Now().UTC()}
			hosts[key] = h
		}
		if mac != "" && h.MAC == "" {
			h.MAC = mac
		}
		if ip != "" {
			h.IPs = mergeUnique(h.IPs, []string{ip})
		}
		h.Source = addSource(h.Source, source)
		h.Online = true
		return h
	}

	// 1) Ambient discovery (mDNS, SSDP) in parallel with the sweep.
	var wg sync.WaitGroup
	var mdnsRes mdnsResult
	var ssdpRes map[string]*ssdpInfo
	if !opts.Liveness {
		wg.Add(2)
		go func() { defer wg.Done(); mdnsRes = discoverMDNS(2 * time.Second) }()
		go func() { defer wg.Done(); ssdpRes = discoverSSDP(3 * time.Second) }()
	}

	// 2) TCP-connect sweep across every prefix (also primes ARP).
	sem := make(chan struct{}, opts.MaxParallel)
	var sweepWg sync.WaitGroup
	for _, cidr := range prefixes {
		for _, ip := range hostsInPrefix(cidr) {
			ipStr := ip.String()
			sweepWg.Add(1)
			sem <- struct{}{}
			go func() {
				defer sweepWg.Done()
				defer func() { <-sem }()
				pr := probeHost(ipStr, opts.PortSet, opts.HostTimeout)
				if !pr.Alive {
					return
				}
				h := upsert(ipStr, "", "tcp")
				mu.Lock()
				h.OpenPorts = mergeInts(h.OpenPorts, pr.OpenPorts)
				if pr.LatencyMs > 0 {
					h.LatencyMs = pr.LatencyMs
				}
				mu.Unlock()
			}()
		}
	}
	sweepWg.Wait()
	wg.Wait()

	// 3) Fold in the ARP cache (MAC for every alive IP) — merge ip-keyed hosts
	// into their MAC-keyed identity.
	arp := arpCache()
	mu.Lock()
	for ip, mac := range arp {
		key := "ip:" + ip
		if ipHost, ok := hosts[key]; ok {
			if _, exists := hosts[mac]; !exists {
				ipHost.MAC = mac
				hosts[mac] = ipHost
			} else {
				hosts[mac].IPs = mergeUnique(hosts[mac].IPs, ipHost.IPs)
				hosts[mac].OpenPorts = mergeInts(hosts[mac].OpenPorts, ipHost.OpenPorts)
			}
			delete(hosts, key)
		} else {
			// ARP knows a host the sweep missed (recently active).
			h := hosts[mac]
			if h == nil {
				h = &Host{MAC: mac, IPs: []string{ip}, Online: true, LastSeen: time.Now().UTC(), Source: "arp"}
				hosts[mac] = h
			} else {
				h.IPs = mergeUnique(h.IPs, []string{ip})
			}
		}
	}
	mu.Unlock()

	// 4) Attach ambient service data + vendor + reverse DNS, then classify.
	ipIndex := map[string]*Host{}
	for _, h := range hosts {
		for _, ip := range h.IPs {
			ipIndex[ip] = h
		}
	}
	if mdnsRes != nil {
		for ip, svcs := range mdnsRes {
			if h := ipIndex[ip]; h != nil {
				h.Services = mergeUnique(h.Services, svcs)
				h.Source = addSource(h.Source, "mdns")
			}
		}
	}
	if ssdpRes != nil {
		for ip, info := range ssdpRes {
			if h := ipIndex[ip]; h != nil {
				h.Services = mergeUnique(h.Services, info.STs)
				if info.Server != "" && h.Model == "" {
					h.Model = info.Server
				}
				h.Source = addSource(h.Source, "ssdp")
			}
		}
	}
	for _, h := range hosts {
		if h.MAC != "" && h.Vendor == "" {
			h.Vendor = vendorForMAC(h.MAC)
		}
		if h.Hostname == "" && len(h.IPs) > 0 {
			h.Hostname = reverseDNS(h.IPs[0], 800*time.Millisecond)
		}
		h.Role = classify(h)
	}

	// 5) SNMP (full scans only) — facts, interfaces, and topology edges.
	var neighbors []Neighbor
	if !opts.Liveness && len(opts.SNMP) > 0 {
		var snmpWg sync.WaitGroup
		var nmu sync.Mutex
		snmpSem := make(chan struct{}, min(opts.MaxParallel, 16))
		for _, h := range hosts {
			if len(h.IPs) == 0 || !snmpReachable(h) {
				continue
			}
			h := h
			snmpWg.Add(1)
			snmpSem <- struct{}{}
			go func() {
				defer snmpWg.Done()
				defer func() { <-snmpSem }()
				edges := snmpQuery(h, h.IPs[0], opts.SNMP, opts.SNMPTimeout)
				nmu.Lock()
				neighbors = append(neighbors, edges...)
				nmu.Unlock()
				h.Role = classify(h) // re-classify with SNMP sysDescr in hand
			}()
		}
		snmpWg.Wait()
	}

	// 6) Materialize.
	var list []Host
	for _, h := range hosts {
		list = append(list, *h)
	}
	method := "full"
	if opts.Liveness {
		method = "liveness"
	}
	return Result{
		SiteID:    opts.SiteID,
		Prefixes:  prefixes,
		Hosts:     list,
		Neighbors: neighbors,
		StartedAt: start.UTC(),
		Duration:  time.Since(start).Round(time.Millisecond).String(),
		Method:    method,
	}
}

// LocalPrefixes returns the IPv4 CIDRs the host is directly attached to. Exposed
// so the agent can advertise its reachable prefixes as collector candidacy.
func LocalPrefixes() []string { return localPrefixes() }

func applyDefaults(o *Options) {
	if len(o.PortSet) == 0 {
		o.PortSet = DefaultPorts
	}
	if o.MaxParallel <= 0 {
		o.MaxParallel = 128
	}
	if o.HostTimeout <= 0 {
		o.HostTimeout = 400 * time.Millisecond
	}
	if o.SNMPTimeout <= 0 {
		o.SNMPTimeout = 2 * time.Second
	}
}

func mergeInts(a, b []int) []int {
	seen := map[int]bool{}
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

func addSource(existing, s string) string {
	if existing == "" {
		return s
	}
	for _, p := range splitComma(existing) {
		if p == s {
			return existing
		}
	}
	return existing + "," + s
}

func splitComma(s string) []string {
	var out []string
	cur := ""
	for _, r := range s {
		if r == ',' {
			out = append(out, cur)
			cur = ""
		} else {
			cur += string(r)
		}
	}
	if cur != "" {
		out = append(out, cur)
	}
	return out
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
