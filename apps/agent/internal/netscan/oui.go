package netscan

import "strings"

// ouiVendors maps a 24-bit MAC OUI (uppercase, no separators) to a manufacturer.
// This is a curated subset covering gear commonly found at MSP client sites; the
// full IEEE registry can be dropped in later (embed + parse) without changing the
// lookup surface. Kept deliberately compact — vendor is a strong classification
// signal even from a partial table.
var ouiVendors = map[string]string{
	// Apple
	"F0189E": "Apple", "3C0754": "Apple", "A85C2C": "Apple", "DC2B2A": "Apple",
	"F80377": "Apple", "8866A5": "Apple", "AC87A3": "Apple", "D0817A": "Apple",
	// Cisco / Meraki
	"00000C": "Cisco", "000142": "Cisco", "0019AA": "Cisco", "588D09": "Cisco",
	"E4AA5D": "Cisco", "00180A": "Cisco Meraki", "88153F": "Cisco Meraki", "E0CB4E": "Cisco Meraki",
	// Ubiquiti
	"002722": "Ubiquiti", "0418D6": "Ubiquiti", "24A43C": "Ubiquiti", "788A20": "Ubiquiti",
	"744401": "Ubiquiti", "B4FBE4": "Ubiquiti", "FCECDA": "Ubiquiti", "687251": "Ubiquiti",
	// Aruba / HPE networking
	"000B86": "Aruba", "6CF37F": "Aruba", "94B40F": "Aruba", "D8C7C8": "Aruba",
	// HP / HP printers
	"001321": "HP", "3822D6": "HP", "9457A5": "HP", "308D99": "HP", "A0D3C1": "HP",
	// Dell
	"00188B": "Dell", "B8CA3A": "Dell", "F8BC12": "Dell", "141877": "Dell", "180373": "Dell",
	// Lenovo
	"00A0D1": "Lenovo", "8C1645": "Lenovo", "54EE75": "Lenovo",
	// Netgear
	"000FB5": "Netgear", "20E52A": "Netgear", "A040A0": "Netgear", "9C3DCF": "Netgear",
	// TP-Link
	"14CC20": "TP-Link", "50C7BF": "TP-Link", "A42BB0": "TP-Link", "EC086B": "TP-Link",
	// Printers
	"002673": "Brother", "008077": "Brother", "3C2AF4": "Brother",
	"0000AA": "Xerox", "9C934E": "Xerox",
	"00000E": "Canon", "2477F7": "Canon", "F4A99C": "Canon",
	"00000F": "Epson", "445E4C": "Epson", "9CAED3": "Epson",
	"08005A": "IBM Ricoh", "00269E": "Ricoh",
	// Cameras / NVR
	"C0561D": "Hikvision", "44A642": "Hikvision", "BCAD28": "Hikvision", "4CBD8F": "Hikvision",
	"000B3F": "Dahua", "3CE33B": "Dahua", "90029A": "Dahua",
	"00408C": "Axis", "ACCC8E": "Axis", "B8A44F": "Axis",
	// NAS
	"0011D8": "Synology", "0011321": "Synology", "001132": "Synology",
	"00089B": "QNAP", "245EBE": "QNAP", "24BFCB": "QNAP",
	// SBC / IoT
	"B827EB": "Raspberry Pi", "DCA632": "Raspberry Pi", "E45F01": "Raspberry Pi", "28CDC1": "Raspberry Pi",
	"D0D2B0": "Amazon", "68549B": "Amazon", "FCA667": "Amazon",
	"1848BE": "Google", "F4F5D8": "Google", "6466B3": "Google Nest",
	// Common NIC chipsets (weak signal — workstation-ish)
	"001C42": "Parallels", "080027": "VirtualBox", "005056": "VMware", "000C29": "VMware",
	"0050F2": "Microsoft", "001DD8": "Microsoft", "3417EB": "Samsung", "5CF6DC": "Samsung",
	"001438": "Intel", "3C970E": "Intel", "8C8CAA": "Intel", "A0A8CD": "Intel",
	"000C43": "Realtek", "525400": "QEMU/KVM",
	// Ubiquiti (extensive — common on managed sites)
	"802AA8": "Ubiquiti", "F09FC2": "Ubiquiti", "68D79A": "Ubiquiti",
	"44D9E7": "Ubiquiti",
	"245A4C": "Ubiquiti", "E063DA": "Ubiquiti", "DC9FDB": "Ubiquiti", "18E829": "Ubiquiti",
	"74ACB9": "Ubiquiti", "70A741": "Ubiquiti", "9483C4": "Ubiquiti", "E43883": "Ubiquiti",
	"D021F9": "Ubiquiti", "AC8BA9": "Ubiquiti", "F492BF": "Ubiquiti", "94A67E": "Ubiquiti",
	// Sonos
	"000E58": "Sonos", "5CAAFD": "Sonos", "B8E937": "Sonos", "949F3E": "Sonos",
	"347E5C": "Sonos", "782FCB": "Sonos", "48A6B8": "Sonos", "5410EC": "Sonos",
	// Apple (more)
	"A4B197": "Apple", "8CC8CD": "Apple", "6C4008": "Apple", "24F094": "Apple",
	"3871DE": "Apple", "9CFC01": "Apple", "F0DBF8": "Apple", "48D705": "Apple",
	// Amazon (Echo/Fire)
	"F0F005": "Amazon", "44650D": "Amazon", "50DCE7": "Amazon", "0C47C9": "Amazon",
	"747548": "Amazon", "A002DC": "Amazon", "38F73D": "Amazon", "FC65DE": "Amazon",
	// Google / Nest
	"F4F5E8": "Google", "94EB2C": "Google", "3C5AB4": "Google", "D8EB46": "Google",
	"18B430": "Google Nest", "641666": "Google Nest",
	// Roku / smart TV / streamers
	"CC6DA0": "Roku", "B0A737": "Roku", "AC3A7A": "Roku", "D83134": "Roku",
	"0C2A69": "Vizio", "C40415": "Samsung TV", "8CEA48": "LG", "CC2D8C": "LG",
	// Cameras / access / IoT hubs
	"18688F": "Wyze", "2CAA8E": "Wyze", "A4DA22": "Ring", "7C70BC": "Nest Cam",
	// Espressif (ESP8266/ESP32 — huge for DIY/IoT)
	"24A160": "Espressif", "3C6105": "Espressif", "807D3A": "Espressif", "A0B765": "Espressif",
	"246F28": "Espressif", "7CDFA1": "Espressif", "DC4F22": "Espressif", "84F3EB": "Espressif",
	// Printers (more)
	"001B78": "HP", "E4E749": "HP", "B00CD1": "HP", "70106F": "HP",
	"F8B156": "Dell Printer", "0000F0": "Samsung", "002548": "Lexmark", "58EA9E": "Kyocera",
	// Networking / SBC / misc
	"001060": "Cisco", "00E04C": "Realtek", "B0B98A": "Netgear", "CC40D0": "Netgear",
	"D8FE8F": "TP-Link", "60634C": "TP-Link", "AC84C6": "TP-Link", "7CA7B0": "Broadcom",
	"E8DE27": "TP-Link", "50FA84": "TP-Link", "5C628B": "TP-Link",
}

// vendorForMAC returns the manufacturer for a MAC address, or "" if unknown.
func vendorForMAC(mac string) string {
	norm := strings.ToUpper(strings.NewReplacer(":", "", "-", "", ".", "").Replace(mac))
	if len(norm) < 6 {
		return ""
	}
	return ouiVendors[norm[:6]]
}
