package netscan

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/gosnmp/gosnmp"
)

// OIDs we care about.
const (
	oidSysDescr   = "1.3.6.1.2.1.1.1.0"
	oidSysUpTime  = "1.3.6.1.2.1.1.3.0"
	oidSysName    = "1.3.6.1.2.1.1.5.0"
	oidIfDescr    = "1.3.6.1.2.1.2.2.1.2"
	oidIfSpeed    = "1.3.6.1.2.1.2.2.1.5"
	oidIfPhys     = "1.3.6.1.2.1.2.2.1.6"
	oidIfAdmin    = "1.3.6.1.2.1.2.2.1.7"
	oidIfOper     = "1.3.6.1.2.1.2.2.1.8"
	oidLldpRemSys = "1.0.8802.1.1.2.1.4.1.1.9" // lldpRemSysName
	oidLldpRemPort = "1.0.8802.1.1.2.1.4.1.1.7" // lldpRemPortId
	oidCdpDevID   = "1.3.6.1.4.1.9.9.23.1.2.1.1.6" // cdpCacheDeviceId
	oidCdpDevPort = "1.3.6.1.4.1.9.9.23.1.2.1.1.7" // cdpCacheDevicePort
)

// snmpQuery polls one host with the first credential that answers. It fills the
// host's SNMP facts + interfaces and returns any neighbor edges (LLDP then CDP).
func snmpQuery(h *Host, ip string, creds []SNMPCred, timeout time.Duration) []Neighbor {
	for _, c := range creds {
		g := newSNMP(ip, c, timeout)
		if g == nil {
			continue
		}
		if err := g.Connect(); err != nil {
			continue
		}
		sys, err := g.Get([]string{oidSysDescr, oidSysUpTime, oidSysName})
		if err != nil || sys == nil || len(sys.Variables) == 0 || sys.Variables[0].Value == nil {
			g.Conn.Close()
			continue
		}
		for _, v := range sys.Variables {
			switch v.Name {
			case "." + oidSysDescr, oidSysDescr:
				h.SysDescr = snmpStr(v)
			case "." + oidSysName, oidSysName:
				h.SysName = snmpStr(v)
			case "." + oidSysUpTime, oidSysUpTime:
				if t, ok := v.Value.(uint32); ok {
					h.UptimeSec = int64(t) / 100 // TimeTicks are centiseconds
				}
			}
		}
		if h.SysName != "" && h.Hostname == "" {
			h.Hostname = h.SysName
		}
		h.Ifaces = snmpInterfaces(g)
		neighbors := snmpNeighbors(g, h)
		g.Conn.Close()
		h.Source = addSource(h.Source, "snmp")
		return neighbors
	}
	return nil
}

func newSNMP(ip string, c SNMPCred, timeout time.Duration) *gosnmp.GoSNMP {
	g := &gosnmp.GoSNMP{
		Target:  ip,
		Port:    161,
		Timeout: timeout,
		Retries: 1,
		MaxOids: gosnmp.MaxOids,
	}
	switch c.Version {
	case "3":
		g.Version = gosnmp.Version3
		g.SecurityModel = gosnmp.UserSecurityModel
		msgFlags := gosnmp.AuthPriv
		if c.PrivKey == "" {
			msgFlags = gosnmp.AuthNoPriv
		}
		if c.AuthKey == "" {
			msgFlags = gosnmp.NoAuthNoPriv
		}
		g.MsgFlags = msgFlags
		g.SecurityParameters = &gosnmp.UsmSecurityParameters{
			UserName:                 c.User,
			AuthenticationProtocol:   authProto(c.AuthAlg),
			AuthenticationPassphrase: c.AuthKey,
			PrivacyProtocol:          privProto(c.PrivAlg),
			PrivacyPassphrase:        c.PrivKey,
		}
	default: // 2c
		g.Version = gosnmp.Version2c
		community := c.Community
		if community == "" {
			community = "public"
		}
		g.Community = community
	}
	return g
}

func authProto(a string) gosnmp.SnmpV3AuthProtocol {
	switch strings.ToUpper(a) {
	case "MD5":
		return gosnmp.MD5
	case "SHA256":
		return gosnmp.SHA256
	case "SHA512":
		return gosnmp.SHA512
	case "", "SHA", "SHA1":
		return gosnmp.SHA
	}
	return gosnmp.NoAuth
}

func privProto(p string) gosnmp.SnmpV3PrivProtocol {
	switch strings.ToUpper(p) {
	case "DES":
		return gosnmp.DES
	case "AES192":
		return gosnmp.AES192
	case "AES256":
		return gosnmp.AES256
	case "", "AES", "AES128":
		return gosnmp.AES
	}
	return gosnmp.NoPriv
}

// snmpInterfaces walks ifTable columns into Interface records keyed by ifIndex.
func snmpInterfaces(g *gosnmp.GoSNMP) []Interface {
	byIdx := map[int]*Interface{}
	get := func(oid string, fn func(idx int, v gosnmp.SnmpPDU)) {
		_ = g.BulkWalk(oid, func(v gosnmp.SnmpPDU) error {
			idx := lastIndex(v.Name)
			if idx < 0 {
				return nil
			}
			if byIdx[idx] == nil {
				byIdx[idx] = &Interface{Index: idx}
			}
			fn(idx, v)
			return nil
		})
	}
	get(oidIfDescr, func(idx int, v gosnmp.SnmpPDU) { byIdx[idx].Name = snmpStr(v) })
	get(oidIfPhys, func(idx int, v gosnmp.SnmpPDU) {
		if b, ok := v.Value.([]byte); ok && len(b) == 6 {
			byIdx[idx].MAC = normalizeMAC(fmt.Sprintf("%02x%02x%02x%02x%02x%02x", b[0], b[1], b[2], b[3], b[4], b[5]))
		}
	})
	get(oidIfSpeed, func(idx int, v gosnmp.SnmpPDU) {
		if s, ok := toUint(v.Value); ok {
			byIdx[idx].SpeedMb = int64(s / 1_000_000)
		}
	})
	get(oidIfAdmin, func(idx int, v gosnmp.SnmpPDU) { byIdx[idx].AdminUp = toInt(v.Value) == 1 })
	get(oidIfOper, func(idx int, v gosnmp.SnmpPDU) { byIdx[idx].OperUp = toInt(v.Value) == 1 })

	var out []Interface
	for _, iface := range byIdx {
		out = append(out, *iface)
	}
	return out
}

// snmpNeighbors builds topology edges from LLDP (preferred) then CDP.
func snmpNeighbors(g *gosnmp.GoSNMP, h *Host) []Neighbor {
	var out []Neighbor
	aName := h.SysName
	if aName == "" {
		aName = h.Hostname
	}

	remSys := walkColumn(g, oidLldpRemSys)
	remPort := walkColumn(g, oidLldpRemPort)
	for idx, name := range remSys {
		out = append(out, Neighbor{
			AMAC: h.MAC, AName: aName,
			BName: name, BPort: remPort[idx],
			Source: "lldp",
		})
	}
	if len(out) == 0 {
		cdpDev := walkColumn(g, oidCdpDevID)
		cdpPort := walkColumn(g, oidCdpDevPort)
		for idx, name := range cdpDev {
			out = append(out, Neighbor{
				AMAC: h.MAC, AName: aName,
				BName: name, BPort: cdpPort[idx],
				Source: "cdp",
			})
		}
	}
	return out
}

// walkColumn walks a table column and returns index-suffix → string value.
func walkColumn(g *gosnmp.GoSNMP, oid string) map[string]string {
	out := map[string]string{}
	_ = g.BulkWalk(oid, func(v gosnmp.SnmpPDU) error {
		suffix := strings.TrimPrefix(strings.TrimPrefix(v.Name, "."), oid+".")
		suffix = strings.TrimPrefix(suffix, ".")
		out[suffix] = snmpStr(v)
		return nil
	})
	return out
}

// --- small SNMP value helpers ---

func snmpStr(v gosnmp.SnmpPDU) string {
	switch t := v.Value.(type) {
	case []byte:
		return strings.TrimSpace(string(t))
	case string:
		return strings.TrimSpace(t)
	default:
		return strings.TrimSpace(fmt.Sprintf("%v", v.Value))
	}
}

func toInt(v interface{}) int {
	switch t := v.(type) {
	case int:
		return t
	case uint:
		return int(t)
	case uint32:
		return int(t)
	case int64:
		return int(t)
	}
	return -1
}

func toUint(v interface{}) (uint64, bool) {
	switch t := v.(type) {
	case uint:
		return uint64(t), true
	case uint32:
		return uint64(t), true
	case uint64:
		return t, true
	case int:
		return uint64(t), true
	}
	return 0, false
}

func lastIndex(name string) int {
	parts := strings.Split(name, ".")
	if len(parts) == 0 {
		return -1
	}
	n, err := strconv.Atoi(parts[len(parts)-1])
	if err != nil {
		return -1
	}
	return n
}

// snmpReachable reports whether UDP/161 is worth trying (host answered a port
// probe on 161 or we just try all when unsure). Kept simple: try if 161 is open.
func snmpReachable(h *Host) bool {
	for _, p := range h.OpenPorts {
		if p == 161 {
			return true
		}
	}
	// SNMP is UDP; a TCP probe won't reveal it. Try infra-looking devices anyway.
	switch h.Role {
	case "switch", "router", "ap", "printer":
		return true
	}
	return h.Vendor != "" && containsAny(strings.ToLower(h.Vendor), "cisco", "ubiquiti", "aruba", "netgear", "tp-link", "meraki", "hp")
}
