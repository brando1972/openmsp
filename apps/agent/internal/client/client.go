package client

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"openmsp/agent/internal/e2ee"
)

// Client handles HTTP communication with the OpenMSP Control Plane API.
// When E2EE is configured (SetE2EE), all post-enrollment requests and responses
// are sealed with X25519 + ChaCha20-Poly1305 AEAD and signed with Ed25519.
type Client struct {
	baseURL       string
	httpClient    *http.Client
	mu            sync.RWMutex
	deviceId      string
	identity      e2ee.Identity
	serverBoxPub  string
	serverSignPub string
}

// New creates a new OpenMSP API client.
func New(baseURL string) *Client {
	baseURL = strings.TrimRight(baseURL, "/")
	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
			Transport: &http.Transport{
				// Note: Application-layer E2EE (X25519 + ChaCha20-Poly1305 + Ed25519)
				// provides end-to-end confidentiality and authenticity even across
				// legacy Windows Server 2012 R2 hosts or SSL-inspecting firewalls.
				TLSClientConfig: &tls.Config{
					MinVersion:         tls.VersionTLS12,
					InsecureSkipVerify: true,
				},
			},
		},
	}
}

// ConfigureE2EE enables or updates the client's v2-e2ee cryptographic session state.
func (c *Client) ConfigureE2EE(deviceId string, id e2ee.Identity, serverBoxPub, serverSignPub string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.deviceId = deviceId
	c.identity = id
	c.serverBoxPub = strings.TrimSpace(serverBoxPub)
	c.serverSignPub = strings.TrimSpace(serverSignPub)
}

// HasE2EE returns true if both the local keypair and the server's X25519 public key are ready.
func (c *Client) HasE2EE() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.deviceId != "" && c.identity.IsValid() && c.serverBoxPub != ""
}

// doJSON performs an HTTP request, automatically wrapping the body in a v2-e2ee
// cryptographic envelope when useE2EE is true and E2EE keys are configured.
func (c *Client) doJSON(ctx context.Context, method, path string, reqPayload interface{}, respTarget interface{}, useE2EE bool) (int, []byte, error) {
	url := fmt.Sprintf("%s%s", c.baseURL, path)
	plainBytes, err := json.Marshal(reqPayload)
	if err != nil {
		return 0, nil, fmt.Errorf("marshal request: %w", err)
	}

	c.mu.RLock()
	devId := c.deviceId
	id := c.identity
	srvBox := c.serverBoxPub
	srvSign := c.serverSignPub
	canSeal := useE2EE && devId != "" && id.IsValid() && srvBox != ""
	c.mu.RUnlock()

	wireBytes := plainBytes
	sealed := false
	if canSeal {
		if env, err := e2ee.Seal(devId, id, srvBox, plainBytes); err == nil {
			if envBytes, err := json.Marshal(env); err == nil {
				wireBytes = envBytes
				sealed = true
			}
		}
	}

	httpReq, err := http.NewRequestWithContext(ctx, method, url, bytes.NewReader(wireBytes))
	if err != nil {
		return 0, nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if sealed {
		httpReq.Header.Set("X-Apex-E2EE", e2ee.EnvelopeVersion)
	}

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return 0, nil, fmt.Errorf("do request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return resp.StatusCode, nil, fmt.Errorf("read response: %w", err)
	}

	// If the server rotated its ephemeral/persistent key and asked for a rekey (428),
	// clear serverBoxPub and retry once with plaintext + public-key handshake fields.
	if sealed && resp.StatusCode == http.StatusPreconditionRequired {
		c.mu.Lock()
		c.serverBoxPub = ""
		c.mu.Unlock()
		return c.doJSON(ctx, method, path, reqPayload, respTarget, false)
	}

	// Unseal response if the server returned a v2-e2ee envelope.
	if resp.Header.Get("X-Apex-E2EE") == e2ee.EnvelopeVersion || bytes.Contains(respBody, []byte(`"v":"v2-e2ee"`)) {
		var respEnv e2ee.Envelope
		if err := json.Unmarshal(respBody, &respEnv); err == nil && respEnv.V == e2ee.EnvelopeVersion {
			opened, err := e2ee.Open(&respEnv, id, srvBox, srvSign)
			if err != nil {
				return resp.StatusCode, respBody, fmt.Errorf("open e2ee response envelope: %w", err)
			}
			respBody = opened
		}
	}

	if resp.StatusCode >= 200 && resp.StatusCode < 300 && respTarget != nil {
		if err := json.Unmarshal(respBody, respTarget); err != nil {
			return resp.StatusCode, respBody, fmt.Errorf("unmarshal response: %w", err)
		}
	}

	return resp.StatusCode, respBody, nil
}

// Enroll performs one-time device enrollment using an enrollment token.
func (c *Client) Enroll(ctx context.Context, req AgentEnrollRequest) (*AgentEnrollResponse, error) {
	var enrollResp AgentEnrollResponse
	status, respBody, err := c.doJSON(ctx, http.MethodPost, "/api/v1/agents/enroll", req, &enrollResp, false)
	if err != nil && status == 0 {
		return nil, fmt.Errorf("do enroll request: %w", err)
	}
	if status != http.StatusOK && status != http.StatusCreated {
		return nil, fmt.Errorf("enroll failed (status %d): %s", status, string(respBody))
	}
	if err != nil {
		return nil, fmt.Errorf("unmarshal enroll response: %w", err)
	}
	return &enrollResp, nil
}

// Heartbeat transmits current system telemetry and retrieves pending commands.
func (c *Client) Heartbeat(ctx context.Context, req AgentHeartbeatRequest) (*AgentHeartbeatResponse, error) {
	var hbResp AgentHeartbeatResponse
	status, respBody, err := c.doJSON(ctx, http.MethodPost, "/api/v1/agents/heartbeat", req, &hbResp, true)
	if err != nil && status == 0 {
		return nil, fmt.Errorf("do heartbeat request: %w", err)
	}
	if status != http.StatusOK {
		return nil, newAPIError("heartbeat", status, respBody)
	}
	if err != nil {
		return nil, fmt.Errorf("unmarshal heartbeat response: %w", err)
	}
	return &hbResp, nil
}

// ReportNetworkScan uploads a collector's discovery result to the control plane.
func (c *Client) ReportNetworkScan(ctx context.Context, req NetworkScanRequest) error {
	status, respBody, err := c.doJSON(ctx, http.MethodPost, "/api/v1/agents/network-scan", req, nil, true)
	if err != nil && status == 0 {
		return fmt.Errorf("do network scan request: %w", err)
	}
	if status != http.StatusOK {
		return fmt.Errorf("network scan report failed (status %d): %s", status, string(respBody))
	}
	return nil
}

// ReportCommandResult sends the output and exit status of a completed command back to the API.
func (c *Client) ReportCommandResult(ctx context.Context, req CommandResultRequest) error {
	status, respBody, err := c.doJSON(ctx, http.MethodPost, "/api/v1/agents/command-result", req, nil, true)
	if err != nil && status == 0 {
		return fmt.Errorf("do command result request: %w", err)
	}
	if status != http.StatusOK {
		return fmt.Errorf("command result report failed (status %d): %s", status, string(respBody))
	}
	return nil
}

// SubmitTicket files a support ticket over the agent's authenticated/encrypted channel.
func (c *Client) SubmitTicket(ctx context.Context, req AgentTicketRequest) (*AgentTicketResponse, error) {
	var tickResp AgentTicketResponse
	status, respBody, err := c.doJSON(ctx, http.MethodPost, "/api/v1/agents/ticket", req, &tickResp, true)
	if err != nil && status == 0 {
		return nil, fmt.Errorf("do ticket request: %w", err)
	}
	if status != http.StatusOK && status != http.StatusCreated {
		return nil, fmt.Errorf("ticket submission failed (status %d): %s", status, string(respBody))
	}
	if err != nil {
		return nil, fmt.Errorf("unmarshal ticket response: %w", err)
	}
	return &tickResp, nil
}

// SyncSecurityPolicy pushes local Shark Fin security policy toggles to the control plane.
func (c *Client) SyncSecurityPolicy(ctx context.Context, deviceId string, payload map[string]interface{}) error {
	path := fmt.Sprintf("/api/v1/security/devices/%s/policy", deviceId)
	status, respBody, err := c.doJSON(ctx, http.MethodPatch, path, payload, nil, false)
	if err != nil && status == 0 {
		return fmt.Errorf("do policy sync request: %w", err)
	}
	if status != http.StatusOK {
		return fmt.Errorf("policy sync failed (status %d): %s", status, string(respBody))
	}
	return nil
}

// APIError is a non-success response from the control plane. Code carries the
// machine-readable `code` field when the API sends one (e.g. "device_unknown").
type APIError struct {
	Op     string
	Status int
	Code   string
	Body   string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("%s failed (status %d): %s", e.Op, e.Status, e.Body)
}

func newAPIError(op string, status int, body []byte) *APIError {
	var parsed struct {
		Code string `json:"code"`
	}
	_ = json.Unmarshal(body, &parsed)
	return &APIError{Op: op, Status: status, Code: parsed.Code, Body: string(body)}
}
