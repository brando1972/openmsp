package client

// DeviceMetric holds system performance telemetry.
type DeviceMetric struct {
	CpuUsage   float64 `json:"cpuUsage"`
	RamUsage   float64 `json:"ramUsage"`
	DiskUsage  float64 `json:"diskUsage"`
	UptimeDays float64 `json:"uptimeDays"`
	LastSeen   string  `json:"lastSeen,omitempty"`
}

// InstalledApp represents an installed software package on the host.
type InstalledApp struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Version     string `json:"version"`
	Publisher   string `json:"publisher"`
	InstallDate string `json:"installDate"`
}

// DeviceService represents a system service or daemon.
type DeviceService struct {
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
	Status      string `json:"status"`      // "running" | "stopped" | "disabled"
	StartupType string `json:"startupType"` // "auto" | "manual" | "disabled"
}

// SystemEventLog represents an event log or system notification.
type SystemEventLog struct {
	ID        string `json:"id"`
	Timestamp string `json:"timestamp"`
	Level     string `json:"level"` // "info" | "warning" | "error" | "critical"
	Source    string `json:"source"`
	Message   string `json:"message"`
	EventID   int    `json:"eventId"`
}

// NetworkInfo contains local and public network identifiers.
type NetworkInfo struct {
	IPAddress  string `json:"ipAddress"`
	MACAddress string `json:"macAddress"`
	PublicIP   string `json:"publicIp,omitempty"`
}

// AgentEnrollRequest payload for POST /api/v1/agents/enroll.
type AgentEnrollRequest struct {
	Token        string `json:"token"`
	Hostname     string `json:"hostname"`
	OS           string `json:"os"` // "macos" | "windows" | "linux"
	OSVersion    string `json:"osVersion"`
	Arch         string `json:"arch,omitempty"`
	SerialNumber string `json:"serialNumber"`
	MACAddress   string `json:"macAddress"`
	IPAddress    string `json:"ipAddress"`
}

// AgentEnrollResponse returned from POST /api/v1/agents/enroll.
type AgentEnrollResponse struct {
	DeviceId                 string                 `json:"deviceId"`
	OrgId                    string                 `json:"orgId"`
	ClientId                 string                 `json:"clientId"`
	SiteId                   string                 `json:"siteId"`
	DeviceSecret             string                 `json:"deviceSecret"`
	HeartbeatIntervalSeconds int                    `json:"heartbeatIntervalSeconds"`
	RustDeskConfig           map[string]interface{} `json:"rustDeskConfig,omitempty"`
}

// AgentHeartbeatRequest payload for POST /api/v1/agents/heartbeat.
type AgentHeartbeatRequest struct {
	DeviceId      string           `json:"deviceId"`
	DeviceSecret  string           `json:"deviceSecret"`
	Metrics       DeviceMetric     `json:"metrics"`
	Network       NetworkInfo      `json:"network"`
	InstalledApps []InstalledApp   `json:"installedApps,omitempty"`
	Services      []DeviceService  `json:"services,omitempty"`
	EventLogs     []SystemEventLog `json:"eventLogs,omitempty"`
	RustDeskId    string           `json:"rustDeskId,omitempty"`
}

// DeviceCommand represents an operational command dispatched to the agent.
type DeviceCommand struct {
	ID          string                 `json:"id"`
	DeviceId    string                 `json:"deviceId"`
	OrgId       string                 `json:"orgId"`
	CommandType string                 `json:"commandType"`
	Payload     map[string]interface{} `json:"payload"`
	Status      string                 `json:"status"`
	Output      string                 `json:"output,omitempty"`
	Error       string                 `json:"error,omitempty"`
	CreatedAt   string                 `json:"createdAt"`
}

// AgentHeartbeatResponse returned from POST /api/v1/agents/heartbeat.
type AgentHeartbeatResponse struct {
	Acknowledged    bool            `json:"acknowledged"`
	ServerTime      string          `json:"serverTime"`
	PendingCommands []DeviceCommand `json:"pendingCommands"`
}

// CommandResultRequest payload for POST /api/v1/agents/command-result.
type CommandResultRequest struct {
	CommandID string `json:"commandId"`
	Status    string `json:"status"` // "completed" | "failed"
	Output    string `json:"output,omitempty"`
	Error     string `json:"error,omitempty"`
}
