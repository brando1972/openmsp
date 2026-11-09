package config

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"

	"openmsp/agent/internal/e2ee"
)

// Config holds persistent configuration for the OpenMSP device agent.
type Config struct {
	ServerURL                string                 `json:"serverUrl"`
	Token                    string                 `json:"token,omitempty"`
	DeviceId                 string                 `json:"deviceId,omitempty"`
	DeviceSecret             string                 `json:"deviceSecret,omitempty"`
	OrgId                    string                 `json:"orgId,omitempty"`
	ClientId                 string                 `json:"clientId,omitempty"`
	SiteId                   string                 `json:"siteId,omitempty"`
	HeartbeatIntervalSeconds int                    `json:"heartbeatIntervalSeconds,omitempty"`
	RustDeskConfig           map[string]interface{} `json:"rustDeskConfig,omitempty"`
	E2EEIdentity             e2ee.Identity          `json:"e2eeIdentity,omitempty"`
	ServerBoxPub             string                 `json:"serverBoxPub,omitempty"`
	ServerSignPub            string                 `json:"serverSignPub,omitempty"`
}

// EnsureKeypair guarantees that the agent has a persistent Ed25519 + X25519
// cryptographic identity generated locally. Returns true if a new keypair was created.
func (c *Config) EnsureKeypair() bool {
	if c == nil || c.E2EEIdentity.IsValid() {
		return false
	}
	id, err := e2ee.GenerateIdentity()
	if err != nil {
		return false
	}
	c.E2EEIdentity = id
	return true
}

// Load reads the config file from disk. If the file does not exist, an error is returned.
func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	// Strip UTF-8 BOM (0xEF 0xBB 0xBF) written by Windows PowerShell 5.1 Set-Content -Encoding UTF8
	data = bytes.TrimPrefix(data, []byte{0xef, 0xbb, 0xbf})
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

// Save writes the config to disk with restricted permissions (0600).
func Save(path string, cfg *Config) error {
	if cfg == nil {
		return errors.New("cannot save nil config")
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0600)
}

// IsEnrolled returns true if the agent has a valid device ID and secret.
func (c *Config) IsEnrolled() bool {
	return c != nil && c.DeviceId != "" && c.DeviceSecret != ""
}
