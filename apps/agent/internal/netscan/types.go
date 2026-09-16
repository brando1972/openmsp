// Package netscan is the ApexMSP on-site network discovery engine. It runs only
// on an agent the control plane has elected as the site "collector". It sweeps
// the local network (ARP, ICMP/TCP liveness, mDNS, SSDP/UPnP, port fingerprint,
// MAC-vendor lookup) and, where SNMP credentials are configured, polls switches
// and printers for interface inventory and LLDP/CDP/bridge neighbor edges — the
// data behind the console's NetBox-style inventory and topology map.
package netscan

import "time"

// Host is one discovered device on the LAN, keyed primarily by MAC (falling back
// to IP when the MAC is unknown, e.g. across an L3 boundary).
type Host struct {
	MAC       string   `json:"mac,omitempty"`
	IPs       []string `json:"ips"`
	Hostname  string   `json:"hostname,omitempty"`
	Vendor    string   `json:"vendor,omitempty"` // from MAC OUI
	Model     string   `json:"model,omitempty"`  // from mDNS/SSDP/SNMP sysDescr
	Role      string   `json:"role,omitempty"`   // switch|router|ap|printer|camera|nas|workstation|phone|iot|unknown
	OpenPorts []int    `json:"openPorts,omitempty"`
	Services  []string `json:"services,omitempty"` // e.g. "_ipp._tcp", "ssdp:MediaServer"
	LatencyMs float64  `json:"latencyMs,omitempty"`
	Online    bool     `json:"online"`

	// SNMP facts (present only when the host answered SNMP).
	SysName   string      `json:"sysName,omitempty"`
	SysDescr  string      `json:"sysDescr,omitempty"`
	UptimeSec int64       `json:"uptimeSec,omitempty"`
	Ifaces    []Interface `json:"ifaces,omitempty"`

	Source  string    `json:"source,omitempty"` // discovery methods that saw it, comma-joined
	LastSeen time.Time `json:"lastSeen"`
}

// Interface is a network interface reported by SNMP ifTable/ifXTable.
type Interface struct {
	Index   int    `json:"index"`
	Name    string `json:"name,omitempty"`
	MAC     string `json:"mac,omitempty"`
	SpeedMb int64  `json:"speedMb,omitempty"`
	AdminUp bool   `json:"adminUp"`
	OperUp  bool   `json:"operUp"`
}

// Neighbor is a topology edge: "a device's port connects to b device's port".
// Source records how we learned it, so the UI can trust authoritative edges
// (lldp/cdp) over inferred ones.
type Neighbor struct {
	AMAC   string `json:"aMac,omitempty"`
	AName  string `json:"aName,omitempty"`
	APort  string `json:"aPort,omitempty"`
	BMAC   string `json:"bMac,omitempty"`
	BName  string `json:"bName,omitempty"`
	BPort  string `json:"bPort,omitempty"`
	Source string `json:"source"` // lldp|cdp|bridge|inferred
}

// Result is the full payload the collector reports to the control plane.
type Result struct {
	SiteID    string     `json:"siteId,omitempty"`
	Prefixes  []string   `json:"prefixes"` // CIDRs scanned
	Hosts     []Host     `json:"hosts"`
	Neighbors []Neighbor `json:"neighbors"`
	StartedAt time.Time  `json:"startedAt"`
	Duration  string     `json:"durationMs"`
	Method    string     `json:"method"` // "full" | "liveness"
}

// SNMPCred is one SNMP credential set to try against a host.
type SNMPCred struct {
	Version   string `json:"version"`   // "2c" | "3"
	Community string `json:"community"` // v2c
	// v3
	User    string `json:"user,omitempty"`
	AuthKey string `json:"authKey,omitempty"`
	AuthAlg string `json:"authAlg,omitempty"` // SHA|MD5
	PrivKey string `json:"privKey,omitempty"`
	PrivAlg string `json:"privAlg,omitempty"` // AES|DES
}

// Options controls one scan run.
type Options struct {
	SiteID       string
	Prefixes     []string // explicit CIDRs; empty ⇒ auto-detect from host interfaces
	Liveness     bool     // true ⇒ fast ARP/ping refresh only (skip deep probes + SNMP)
	SNMP         []SNMPCred
	PortSet      []int
	MaxParallel  int
	HostTimeout  time.Duration
	SNMPTimeout  time.Duration
}

// DefaultPorts is the curated fingerprint port set: identity + tunnel affordances.
var DefaultPorts = []int{
	22,   // ssh
	23,   // telnet
	53,   // dns
	80,   // http
	139,  // netbios
	443,  // https
	445,  // smb
	515,  // lpd (printer)
	554,  // rtsp (camera)
	631,  // ipp (printer)
	3389, // rdp
	5000, // nas / upnp
	5001, // nas
	8000, // camera admin
	8080, // http-alt admin
	8443, // https-alt admin
	9100, // jetdirect (printer)
}
