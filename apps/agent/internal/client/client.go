package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Client handles HTTP communication with the OpenMSP Control Plane API.
type Client struct {
	baseURL    string
	httpClient *http.Client
}

// New creates a new OpenMSP API client.
func New(baseURL string) *Client {
	baseURL = strings.TrimRight(baseURL, "/")
	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

// Enroll performs one-time device enrollment using an enrollment token.
func (c *Client) Enroll(ctx context.Context, req AgentEnrollRequest) (*AgentEnrollResponse, error) {
	url := fmt.Sprintf("%s/api/v1/agents/enroll", c.baseURL)
	bodyBytes, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal enroll request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("create enroll request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("do enroll request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read enroll response: %w", err)
	}

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return nil, fmt.Errorf("enroll failed (status %d): %s", resp.StatusCode, string(respBody))
	}

	var enrollResp AgentEnrollResponse
	if err := json.Unmarshal(respBody, &enrollResp); err != nil {
		return nil, fmt.Errorf("unmarshal enroll response: %w", err)
	}

	return &enrollResp, nil
}

// Heartbeat transmits current system telemetry and retrieves pending commands.
func (c *Client) Heartbeat(ctx context.Context, req AgentHeartbeatRequest) (*AgentHeartbeatResponse, error) {
	url := fmt.Sprintf("%s/api/v1/agents/heartbeat", c.baseURL)
	bodyBytes, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal heartbeat request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("create heartbeat request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("do heartbeat request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read heartbeat response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("heartbeat failed (status %d): %s", resp.StatusCode, string(respBody))
	}

	var hbResp AgentHeartbeatResponse
	if err := json.Unmarshal(respBody, &hbResp); err != nil {
		return nil, fmt.Errorf("unmarshal heartbeat response: %w", err)
	}

	return &hbResp, nil
}

// ReportCommandResult sends the output and exit status of a completed command back to the API.
func (c *Client) ReportCommandResult(ctx context.Context, req CommandResultRequest) error {
	url := fmt.Sprintf("%s/api/v1/agents/command-result", c.baseURL)
	bodyBytes, err := json.Marshal(req)
	if err != nil {
		return fmt.Errorf("marshal command result request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return fmt.Errorf("create command result request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return fmt.Errorf("do command result request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read command result response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("command result report failed (status %d): %s", resp.StatusCode, string(respBody))
	}

	return nil
}
