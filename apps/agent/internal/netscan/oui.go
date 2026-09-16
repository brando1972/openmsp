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
}

// vendorForMAC returns the manufacturer for a MAC address, or "" if unknown.
func vendorForMAC(mac string) string {
	norm := strings.ToUpper(strings.NewReplacer(":", "", "-", "", ".", "").Replace(mac))
	if len(norm) < 6 {
		return ""
	}
	return ouiVendors[norm[:6]]
}
