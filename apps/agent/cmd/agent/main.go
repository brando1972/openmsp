package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"openmsp/agent/internal/client"
	"openmsp/agent/internal/collector"
	"openmsp/agent/internal/config"
	"openmsp/agent/internal/executor"
	"openmsp/agent/internal/tray"
	"openmsp/agent/internal/updater"
)

// openURL opens a URL in the user's default browser (best effort).
func openURL(url string) {
	if url == "" {
		return
	}
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	_ = cmd.Start()
}

// Version is the agent version; overridable at build time via
// -ldflags "-X main.Version=x.y.z".
var Version = "0.2.0-dev"

func main() {
	serverFlag := flag.String("server", "", "API base URL (overrides config file when provided)")
	tokenFlag := flag.String("token", "", "One-time enrollment token (e.g. demo-enrollment-token-2026)")
	configFlag := flag.String("config", "openmsp-agent.json", "Path to local config JSON")
	runOnceFlag := flag.Bool("run-once", false, "Run a single heartbeat and exit")
	intervalFlag := flag.Int("interval", 0, "Heartbeat interval in seconds (overrides config file when provided)")
	serverKeyFlag := flag.String("server-key", "", "Base64 Ed25519 public key; when set, command signatures are verified")
	versionFlag := flag.Bool("version", false, "Print agent version and exit")
	dumpFlag := flag.Bool("dump", false, "Collect and print all local telemetry as JSON, then exit (no server needed)")
	trayFlag := flag.Bool("tray", false, "Show the status-bar/system-tray icon (requires a build with -tags tray, run in a user session)")
	uiOnlyFlag := flag.Bool("ui-only", false, "Tray UI only: show the icon/menu but do not enroll or send heartbeats (pair with the headless daemon)")
	autoUpdateFlag := flag.Bool("auto-update", true, "Automatically download and apply newer agent versions advertised by the control plane")

	flag.Parse()
	autoUpdate := *autoUpdateFlag

	if *versionFlag {
		fmt.Printf("openmsp-agent %s (%s/%s)\n", Version, runtime.GOOS, runtime.GOARCH)
		return
	}

	if *dumpFlag {
		sysInfo := collector.GetSystemInfo()
		metrics, _ := collector.CollectMetrics()
		security := collector.CollectSecurityPosture()
		network := collector.CollectNetwork()
		apps := collector.CollectInstalledApps()
		services := collector.CollectServices()
		dump := map[string]interface{}{
			"agentVersion":       Version,
			"platform":           fmt.Sprintf("%s/%s", runtime.GOOS, runtime.GOARCH),
			"host":               sysInfo,
			"metrics":            metrics,
			"security":           security,
			"network":            network,
			"installedAppsCount": len(apps),
			"servicesCount":      len(services),
		}
		out, _ := json.MarshalIndent(dump, "", "  ")
		fmt.Println(string(out))
		return
	}

	log.Printf("[*] OpenMSP Device Agent %s starting...", Version)

	// 1. Load or initialize configuration
	cfg, err := config.Load(*configFlag)
	if err != nil {
		if !os.IsNotExist(err) {
			log.Printf("[!] Warning reading config %s: %v", *configFlag, err)
		}
		cfg = &config.Config{}
	}

	// Override with CLI flags only when explicitly provided
	if *serverFlag != "" {
		cfg.ServerURL = *serverFlag
	}
	if *tokenFlag != "" {
		cfg.Token = *tokenFlag
	}
	if *intervalFlag > 0 {
		cfg.HeartbeatIntervalSeconds = *intervalFlag
	}
	if *serverKeyFlag != "" {
		cfg.ServerPublicKey = *serverKeyFlag
	}

	// Apply defaults for required values not set by config or flags
	if cfg.ServerURL == "" {
		cfg.ServerURL = "http://localhost:3001"
	}
	if cfg.HeartbeatIntervalSeconds <= 0 {
		cfg.HeartbeatIntervalSeconds = 30
	}

	// Tray UI-only mode: just the menu-bar/tray icon, no enrollment or
	// heartbeats. The headless daemon does the real work; this is the user's
	// GUI-session companion, so the machine enrolls exactly once.
	if *trayFlag && *uiOnlyFlag {
		if !tray.Supported() {
			log.Fatalln("[-] --ui-only tray requires a build with -tags tray")
		}
		log.Println("[*] Tray UI-only mode (no enrollment/heartbeat)")
		tray.Run(tray.Callbacks{
			OnOpenConsole:  func() { openURL(cfg.ServerURL) },
			OnCreateTicket: func() { openURL(cfg.ServerURL + "/tickets/new") },
			OnSyncNow:      func() {}, // daemon owns heartbeats in this mode
			OnQuit:         func() { os.Exit(0) },
		})
		return
	}

	apiClient := client.New(cfg.ServerURL)
	execManager := executor.New()

	verifier, err := executor.NewVerifier(cfg.ServerPublicKey)
	if err != nil {
		log.Fatalf("[-] Invalid server public key: %v", err)
	}
	if verifier.Enabled() {
		log.Println("[*] Command signature verification: ENABLED")
	} else {
		log.Println("[!] Command signature verification: DISABLED (no server public key configured)")
	}

	ctx := context.Background()

	// 2. Enrollment check
	if !cfg.IsEnrolled() {
		log.Println("[*] Device not enrolled. Initiating enrollment...")
		if cfg.Token == "" {
			log.Fatalf("[-] Enrollment failed: device is not enrolled and no --token was provided")
		}

		sysInfo := collector.GetSystemInfo()
		log.Printf("[*] Discovered host: %s (OS: %s %s, Serial: %s, IP: %s, MAC: %s)",
			sysInfo.Hostname, sysInfo.OS, sysInfo.OSVersion, sysInfo.SerialNumber, sysInfo.IPAddress, sysInfo.MACAddress)

		enrollReq := client.AgentEnrollRequest{
			Token:        cfg.Token,
			Hostname:     sysInfo.Hostname,
			OS:           sysInfo.OS,
			OSVersion:    sysInfo.OSVersion,
			Arch:         runtime.GOARCH,
			SerialNumber: sysInfo.SerialNumber,
			MACAddress:   sysInfo.MACAddress,
			IPAddress:    sysInfo.IPAddress,
		}

		enrollResp, err := apiClient.Enroll(ctx, enrollReq)
		if err != nil {
			log.Fatalf("[-] Enrollment error: %v", err)
		}

		cfg.DeviceId = enrollResp.DeviceId
		cfg.DeviceSecret = enrollResp.DeviceSecret
		cfg.OrgId = enrollResp.OrgId
		cfg.ClientId = enrollResp.ClientId
		cfg.SiteId = enrollResp.SiteId
		if enrollResp.HeartbeatIntervalSeconds > 0 {
			cfg.HeartbeatIntervalSeconds = enrollResp.HeartbeatIntervalSeconds
		}
		cfg.RustDeskConfig = enrollResp.RustDeskConfig

		if err := config.Save(*configFlag, cfg); err != nil {
			log.Fatalf("[-] Failed to save config to %s: %v", *configFlag, err)
		}

		log.Printf("[+] Successfully enrolled! Device ID: %s, Org: %s, Client: %s",
			cfg.DeviceId, cfg.OrgId, cfg.ClientId)
	} else {
		log.Printf("[*] Device already enrolled with ID: %s (Org: %s)", cfg.DeviceId, cfg.OrgId)
	}

	// 3. Heartbeat & Command Processing
	sendHeartbeat := func() error {
		metrics, err := collector.CollectMetrics()
		if err != nil {
			log.Printf("[!] Warning collecting metrics: %v", err)
		}

		network := collector.CollectNetwork()
		installedApps := collector.CollectInstalledApps()
		services := collector.CollectServices()
		security := collector.CollectSecurityPosture()

		hbReq := client.AgentHeartbeatRequest{
			DeviceId:      cfg.DeviceId,
			DeviceSecret:  cfg.DeviceSecret,
			Metrics:       metrics,
			Network:       network,
			InstalledApps: installedApps,
			Services:      services,
			Security:      &security,
			AgentVersion:  Version,
			Arch:          runtime.GOARCH,
		}

		hbResp, err := apiClient.Heartbeat(ctx, hbReq)
		if err != nil {
			return fmt.Errorf("heartbeat API error: %w", err)
		}

		log.Printf("[+] Heartbeat acknowledged at %s (CPU: %.1f%%, RAM: %.1f%%, Disk: %.1f%%, Uptime: %.2fd)",
			hbResp.ServerTime, metrics.CpuUsage, metrics.RamUsage, metrics.DiskUsage, metrics.UptimeDays)

		// Process pending commands if any
		if len(hbResp.PendingCommands) > 0 {
			log.Printf("[*] Received %d pending command(s)", len(hbResp.PendingCommands))
			for _, cmd := range hbResp.PendingCommands {
				if err := verifier.Verify(cmd); err != nil {
					log.Printf("[-] Refusing command %s: %v", cmd.ID, err)
					refused := client.CommandResultRequest{
						CommandID: cmd.ID,
						Status:    "failed",
						Error:     fmt.Sprintf("agent refused command: %v", err),
					}
					if rerr := apiClient.ReportCommandResult(ctx, refused); rerr != nil {
						log.Printf("[!] Failed to report refusal for command %s: %v", cmd.ID, rerr)
					}
					continue
				}
				// update_agent can be pushed from the console to force an update now
				if cmd.CommandType == "update_agent" {
					applied, newV, uerr := updater.CheckAndApply(ctx, cfg.ServerURL, Version, true)
					result := client.CommandResultRequest{CommandID: cmd.ID, Status: "completed"}
					if uerr != nil {
						result.Status = "failed"
						result.Error = uerr.Error()
					} else if applied {
						result.Output = fmt.Sprintf("Updating to %s; agent will restart", newV)
					} else {
						result.Output = "Already up to date"
					}
					_ = apiClient.ReportCommandResult(ctx, result)
					continue
				}
				log.Printf("[*] Executing command %s (Type: %s)", cmd.ID, cmd.CommandType)
				result := execManager.Execute(ctx, cmd)
				log.Printf("[+] Command %s result: status=%s", cmd.ID, result.Status)

				if err := apiClient.ReportCommandResult(ctx, result); err != nil {
					log.Printf("[!] Failed to report result for command %s: %v", cmd.ID, err)
				} else {
					log.Printf("[+] Command %s result successfully delivered to control plane", cmd.ID)
				}
			}
		}

		// Auto-update: if the control plane advertises a newer version, apply it.
		if autoUpdate && hbResp.LatestAgentVersion != "" {
			if applied, newV, uerr := updater.CheckAndApply(ctx, cfg.ServerURL, Version, false); uerr != nil {
				log.Printf("[!] Auto-update check failed: %v", uerr)
			} else if applied {
				log.Printf("[+] Auto-updating to %s; restarting", newV)
			}
		}

		return nil
	}

	// 4. Run first heartbeat
	if err := sendHeartbeat(); err != nil {
		log.Printf("[!] Initial heartbeat failed: %v", err)
		if *runOnceFlag {
			os.Exit(1)
		}
	}

	if *runOnceFlag {
		log.Println("[+] --run-once specified. Exiting successfully.")
		return
	}

	// 5. Continuous heartbeat loop
	interval := cfg.HeartbeatIntervalSeconds
	if interval <= 0 {
		interval = 30
	}

	// triggerCh lets the tray "Sync Now" item force an immediate heartbeat.
	triggerCh := make(chan struct{}, 1)

	runLoop := func() {
		log.Printf("[+] Continuous agent active. Sending heartbeats every %ds. Press Ctrl+C to exit.", interval)
		ticker := time.NewTicker(time.Duration(interval) * time.Second)
		defer ticker.Stop()

		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

		for {
			select {
			case <-ticker.C:
				if err := sendHeartbeat(); err != nil {
					log.Printf("[!] Heartbeat failed: %v", err)
				}
			case <-triggerCh:
				log.Println("[*] Manual sync requested from tray")
				if err := sendHeartbeat(); err != nil {
					log.Printf("[!] Heartbeat failed: %v", err)
				}
			case sig := <-sigChan:
				log.Printf("[*] Received signal %v. Shutting down agent gracefully.", sig)
				tray.Quit()
				return
			}
		}
	}

	// Tray mode: the tray must own the main thread, so run the agent loop in a
	// goroutine. Requires a build with -tags tray (and a user GUI session).
	if *trayFlag {
		if !tray.Supported() {
			log.Println("[!] --tray requested but this build has no tray support (rebuild with -tags tray). Continuing headless.")
			runLoop()
			return
		}
		log.Println("[*] Starting with status-bar/system-tray icon")
		go runLoop()
		tray.Run(tray.Callbacks{
			OnSyncNow: func() {
				select {
				case triggerCh <- struct{}{}:
				default: // a sync is already queued
				}
			},
			OnOpenConsole:  func() { openURL(cfg.ServerURL) },
			OnCreateTicket: func() { openURL(cfg.ServerURL + "/tickets/new") },
			OnQuit:         func() { os.Exit(0) },
		})
		return
	}

	runLoop()
}
