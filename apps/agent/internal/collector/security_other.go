//go:build !darwin

package collector

import "openmsp/agent/internal/client"

// getSecurityPosture is a stub on non-macOS platforms.
// Windows (BitLocker, Defender, firewall) and Linux collectors land later.
func getSecurityPosture() client.SecurityPosture {
	return client.SecurityPosture{
		DiskEncryption: "unknown",
		PendingUpdates: -1,
	}
}

// getBattery is a stub on non-macOS platforms for now.
func getBattery() *client.Battery {
	return nil
}
