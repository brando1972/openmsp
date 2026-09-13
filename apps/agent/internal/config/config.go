package config

import (
	"encoding/json"
	"errors"
	"os"
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
	// ServerPublicKey is a base64-encoded Ed25519 key. When set, the agent
	// verifies the signature on every dispatched command before executing it.
	ServerPublicKey string `json:"serverPublicKey,omitempty"`
}

// Load reads the config file from disk. If the file does not exist, an error is returned.
func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
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
