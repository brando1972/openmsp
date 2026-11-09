// Package ipc provides a local loopback-only HTTP proxy (127.0.0.1:41920)
// so unprivileged user-session helpers (macOS Shark Fin MenuBar and Windows
// System Tray) can toggle security policy and submit support tickets without
// ever needing read access to root/SYSTEM device secrets or E2EE private keys.
package ipc

import (
	"context"
	"encoding/json"
	"log"
	"net"
	"net/http"
	"time"

	"openmsp/agent/internal/client"
	"openmsp/agent/internal/config"
	"openmsp/agent/internal/security"
	"openmsp/agent/internal/version"
)

const LoopbackAddr = "127.0.0.1:41920"

// Start launches the local loopback IPC server in a background goroutine.
func Start(ctx context.Context, api *client.Client, cfg *config.Config) {
	mux := http.NewServeMux()

	mux.HandleFunc("/v1/local/status", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"ok":         true,
			"enrolled":   cfg.IsEnrolled(),
			"deviceId":   cfg.DeviceId,
			"serverUrl":  cfg.ServerURL,
			"e2eeActive": api.HasE2EE(),
			"version":    version.Version,
		})
	})

	mux.HandleFunc("/v1/local/policy", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodGet {
			pol := security.LoadSecurityPolicy()
			_ = json.NewEncoder(w).Encode(pol)
			return
		}
		if r.Method != http.MethodPatch && r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var updates map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"ok": false, "error": "invalid json"})
			return
		}
		updated, err := security.ApplyPolicyUpdate(updates, "sharkfin_client")
		if err != nil {
			w.WriteHeader(http.StatusForbidden)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"ok": false, "error": err.Error(), "policy": updated})
			return
		}

		// Sync to Control Plane asynchronously using the privileged agent's credentials
		if cfg.IsEnrolled() {
			go func(pol security.SharkFinSecurityPolicy) {
				cctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				defer cancel()
				payload := map[string]interface{}{
					"deviceId":                    cfg.DeviceId,
					"deviceSecret":                cfg.DeviceSecret,
					"preventiveAvEnabled":         pol.PreventiveAvEnabled,
					"endpointEdrEnabled":          pol.EndpointEdrEnabled,
					"ransomwareProtectionEnabled": pol.RansomwareProtectionEnabled,
					"canaryTripwireEnabled":       pol.CanaryTripwireEnabled,
					"yaraClamScannerEnabled":      pol.YaraClamScannerEnabled,
					"soarOrborusWorkerEnabled":    pol.SoarOrborusWorkerEnabled,
					"policyLockedByAdmin":         pol.PolicyLockedByAdmin,
					"updatedBy":                   "sharkfin_local_ipc",
				}
				_ = api.SyncSecurityPolicy(cctx, cfg.DeviceId, payload)
			}(updated)
		}

		_ = json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "policy": updated})
	})

	mux.HandleFunc("/v1/local/ticket", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if !cfg.IsEnrolled() {
			w.WriteHeader(http.StatusServiceUnavailable)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"ok": false, "error": "agent not enrolled"})
			return
		}
		var body struct {
			Subject     string `json:"subject"`
			Description string `json:"description"`
			Priority    string `json:"priority"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Subject == "" {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"ok": false, "error": "subject is required"})
			return
		}
		tctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
		defer cancel()
		resp, err := api.SubmitTicket(tctx, client.AgentTicketRequest{
			DeviceId:     cfg.DeviceId,
			DeviceSecret: cfg.DeviceSecret,
			Subject:      body.Subject,
			Description:  body.Description,
			Priority:     body.Priority,
		})
		if err != nil {
			w.WriteHeader(http.StatusBadGateway)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"ok": false, "error": err.Error()})
			return
		}
		_ = json.NewEncoder(w).Encode(resp)
	})

	ln, err := net.Listen("tcp", LoopbackAddr)
	if err != nil {
		log.Printf("[ipc] local loopback listener (%s) unavailable: %v", LoopbackAddr, err)
		return
	}
	srv := &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	go func() {
		<-ctx.Done()
		_ = srv.Close()
	}()
	go func() {
		log.Printf("[ipc] local Shark Fin IPC proxy listening on http://%s", LoopbackAddr)
		if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
			log.Printf("[ipc] server stopped: %v", err)
		}
	}()
}
