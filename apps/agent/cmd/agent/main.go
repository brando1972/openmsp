package main

import (
	"bufio"
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"encoding/json"
	"path/filepath"
	"runtime"
	"strings"
	"sync"

	"openmsp/agent/internal/client"
	"openmsp/agent/internal/collector"
	"openmsp/agent/internal/config"
	"openmsp/agent/internal/executor"
	"openmsp/agent/internal/netscan"
	"openmsp/agent/internal/remotesupport"
	"openmsp/agent/internal/tunnel"
	"openmsp/agent/internal/updater"
	"openmsp/agent/internal/version"
)

// collectorState tracks this agent's site-collector role between heartbeats.
type collectorState struct {
	mu       sync.Mutex
	active   bool
	scanning bool
	lastFull time.Time
	lastLive time.Time
}

var siteCollector collectorState

func (s *collectorState) isActive() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.active
}

// manageCollector reacts to the election result in each heartbeat response. When
// this agent holds the collector role it runs discovery on the cadence the
// control plane specified (or on an explicit ScanNow), reporting results back.
// Scans run in the background so they never block the heartbeat loop.
func manageCollector(ctx context.Context, api *client.Client, cfg *config.Config, resp *client.AgentHeartbeatResponse) {
	siteCollector.mu.Lock()
	was := siteCollector.active
	siteCollector.active = resp.Collector
	siteCollector.mu.Unlock()

	// The on-LAN reach-through data plane runs only on the elected collector.
	tunnel.Global().SetEnabled(resp.Collector)

	if !resp.Collector {
		if was {
			log.Printf("[collector] role released for this site")
		}
		return
	}
	if !was {
		log.Printf("[collector] elected as site collector for org %s", cfg.OrgId)
	}
	sc := resp.ScanConfig
	if sc == nil || !sc.Enabled {
		return
	}

	fullEvery := time.Duration(orDefault(sc.FullIntervalMin, 30)) * time.Minute
	liveEvery := time.Duration(orDefault(sc.LiveIntervalMin, 5)) * time.Minute

	siteCollector.mu.Lock()
	if siteCollector.scanning {
		siteCollector.mu.Unlock()
		return
	}
	needFull := sc.ScanNow || siteCollector.lastFull.IsZero() || time.Since(siteCollector.lastFull) >= fullEvery
	needLive := !needFull && (siteCollector.lastLive.IsZero() || time.Since(siteCollector.lastLive) >= liveEvery)
	if !needFull && !needLive {
		siteCollector.mu.Unlock()
		return
	}
	siteCollector.scanning = true
	siteCollector.mu.Unlock()

	go func(full bool) {
		defer func() {
			siteCollector.mu.Lock()
			siteCollector.scanning = false
			if full {
				siteCollector.lastFull = time.Now()
			} else {
				siteCollector.lastLive = time.Now()
			}
			siteCollector.mu.Unlock()
		}()

		opts := netscan.Options{
			SiteID:   cfg.SiteId,
			Prefixes: sc.Prefixes,
			Liveness: !full,
			SNMP:     toNetscanCreds(sc.SNMP),
		}
		kind := "liveness"
		if full {
			kind = "full"
		}
		log.Printf("[collector] starting %s network scan...", kind)
		result := netscan.Scan(opts)
		log.Printf("[collector] %s scan done: %d hosts, %d edges in %s", kind, len(result.Hosts), len(result.Neighbors), result.Duration)

		raw, err := json.Marshal(result)
		if err != nil {
			log.Printf("[collector] marshal scan failed: %v", err)
			return
		}
		if err := api.ReportNetworkScan(ctx, client.NetworkScanRequest{
			DeviceId: cfg.DeviceId, DeviceSecret: cfg.DeviceSecret, Scan: raw,
		}); err != nil {
			log.Printf("[collector] report scan failed: %v", err)
			return
		}
		log.Printf("[collector] scan reported to control plane")
	}(needFull)
}

func toNetscanCreds(in []client.SNMPCred) []netscan.SNMPCred {
	out := make([]netscan.SNMPCred, 0, len(in))
	for _, c := range in {
		out = append(out, netscan.SNMPCred{
			Version: c.Version, Community: c.Community,
			User: c.User, AuthKey: c.AuthKey, AuthAlg: c.AuthAlg,
			PrivKey: c.PrivKey, PrivAlg: c.PrivAlg,
		})
	}
	return out
}

func orDefault(v, d int) int {
	if v <= 0 {
		return d
	}
	return v
}

func main() {
	serverDefault := "https://api.apexmsp.app"
	if s := os.Getenv("OPENMSP_SERVER"); s != "" {
		serverDefault = s
	}
	serverFlag := flag.String("server", serverDefault, "API base URL")
	tokenFlag := flag.String("token", "", "One-time enrollment token (e.g. apex-brandon-ray)")
	configFlag := flag.String("config", "openmsp-agent.json", "Path to local config JSON")
	runOnceFlag := flag.Bool("run-once", false, "Run a single heartbeat and exit")
	intervalFlag := flag.Int("interval", 10, "Heartbeat interval in seconds")
	installFlag := flag.Bool("install", false, "Install as persistent Windows Service")

	flag.Parse()

	// Complete any staged Windows self-update from a previous run before anything else.
	updater.ApplyPendingWindows()

	runService(func() {
		log.Printf("[*] OpenMSP Device Agent starting (v%s)...", version.Version)

		// 1. Load or initialize configuration
		cfg, err := config.Load(*configFlag)
		if err != nil {
			if !os.IsNotExist(err) {
				log.Printf("[!] Warning reading config %s: %v", *configFlag, err)
			}
			cfg = &config.Config{
				ServerURL:                *serverFlag,
				HeartbeatIntervalSeconds: *intervalFlag,
			}
		}

		// Override with CLI flags if provided
		if *serverFlag != "" {
			cfg.ServerURL = *serverFlag
		}
		if *tokenFlag != "" {
			cfg.Token = *tokenFlag
		}
		if *intervalFlag > 0 {
			cfg.HeartbeatIntervalSeconds = *intervalFlag
		}

		apiClient := client.New(cfg.ServerURL)
		execManager := executor.New()
		ctx := context.Background()

		// 2. Enrollment check
		if !cfg.IsEnrolled() {
			log.Println("[*] Device not enrolled. Initiating enrollment...")
			if cfg.Token == "" {
				// Check for a token.txt or enrollment-token.txt next to binary or in current dir
				exePath, _ := os.Executable()
				exeDir := filepath.Dir(exePath)
				for _, cand := range []string{"token.txt", "enrollment-token.txt", filepath.Join(exeDir, "token.txt"), filepath.Join(exeDir, "enrollment-token.txt")} {
					if tBytes, err := os.ReadFile(cand); err == nil {
						tStr := strings.TrimSpace(string(tBytes))
						if tStr != "" {
							cfg.Token = tStr
							log.Printf("[*] Loaded enrollment token from %s", cand)
							break
						}
					}
				}
			}

			if cfg.Token == "" {
				if envTok := os.Getenv("OPENMSP_TOKEN"); envTok != "" {
					cfg.Token = strings.TrimSpace(envTok)
				} else if envTok := os.Getenv("APEXMSP_TOKEN"); envTok != "" {
					cfg.Token = strings.TrimSpace(envTok)
				}
			}

			if cfg.Token == "" {
				defaultToken := "apex-brandon-ray"
				fmt.Println("==================================================")
				fmt.Println("  ApexMSP Endpoint Agent Setup")
				fmt.Println("==================================================")
				fmt.Printf("Control Plane: %s\n", cfg.ServerURL)
				fmt.Printf("Please paste your Enrollment Token [Press Enter for default: %s]: ", defaultToken)

				scanner := bufio.NewScanner(os.Stdin)
				var userToken string
				if scanner.Scan() {
					userToken = strings.TrimSpace(scanner.Text())
				}
				if userToken == "" {
					userToken = defaultToken
					fmt.Printf("Using default token: %s\n", defaultToken)
				}
				cfg.Token = userToken
			}

			sysInfo := collector.GetSystemInfo()
			log.Printf("[*] Discovered host: %s (OS: %s %s, Serial: %s, IP: %s, MAC: %s)",
				sysInfo.Hostname, sysInfo.OS, sysInfo.OSVersion, sysInfo.SerialNumber, sysInfo.IPAddress, sysInfo.MACAddress)

			enrollReq := client.AgentEnrollRequest{
				Token:        cfg.Token,
				Hostname:     sysInfo.Hostname,
				OS:           sysInfo.OS,
				OSVersion:    sysInfo.OSVersion,
				SerialNumber: sysInfo.SerialNumber,
				MACAddress:   sysInfo.MACAddress,
				IPAddress:    sysInfo.IPAddress,
			}

			enrollResp, err := apiClient.Enroll(ctx, enrollReq)
			if err != nil {
				log.Printf("[-] Enrollment error: %v", err)
				if runtime.GOOS == "windows" && !*installFlag {
					fmt.Println("\nPress Enter to exit...")
					var dummy string
					fmt.Scanln(&dummy)
				}
				os.Exit(1)
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

			if runtime.GOOS == "windows" {
				_ = installWindowsService(*configFlag)
			}

			if *installFlag {
				remotesupport.EnsureInstalled()
				time.Sleep(1 * time.Second)
				log.Println("[+] ApexMSP agent installed as Windows Service and running. Exiting installer.")
				return
			}
		} else {
			log.Printf("[*] Device already enrolled with ID: %s (Org: %s)", cfg.DeviceId, cfg.OrgId)
			if *installFlag && runtime.GOOS == "windows" {
				_ = installWindowsService(*configFlag)
				remotesupport.EnsureInstalled()
				log.Println("[+] ApexMSP Windows Service configured.")
				return
			}
		}

	// 2.5 Automatically ensure Remote Support engine (MeshAgent) and Shark Fin UI are running
	remotesupport.EnsureInstalled()

	// Bring up the on-LAN reach-through supervisor. It idles until this agent is
	// elected collector (manageCollector flips it on), then holds a persistent
	// channel to the control plane for SSH/web sessions into discovered devices.
	tunnel.Global().Configure(tunnel.Config{
		ServerURL:    cfg.ServerURL,
		DeviceId:     cfg.DeviceId,
		DeviceSecret: cfg.DeviceSecret,
		SiteId:       cfg.SiteId,
		OrgId:        cfg.OrgId,
	})
	go tunnel.Global().Run(ctx)

	// 3. Heartbeat & Command Processing
	sendHeartbeat := func() error {
		metrics, err := collector.CollectMetrics()
		if err != nil {
			log.Printf("[!] Warning collecting metrics: %v", err)
		}

		network := collector.CollectNetwork()
		installedApps := collector.CollectInstalledApps()
		services := collector.CollectServices()

		hbReq := client.AgentHeartbeatRequest{
			DeviceId:      cfg.DeviceId,
			DeviceSecret:  cfg.DeviceSecret,
			Metrics:       metrics,
			Network:       network,
			InstalledApps: installedApps,
			Services:      services,
			Collector: &client.CollectorCandidacy{
				Platform:    collector.GetSystemInfo().OS,
				UptimeDays:  metrics.UptimeDays,
				Wired:       false,
				CanRawScan:  os.Geteuid() == 0,
				Prefixes:    netscan.LocalPrefixes(),
				IsCollector: siteCollector.isActive(),
			},
			AgentVersion: version.Version,
			Arch:         runtime.GOARCH,
		}

		hbResp, err := apiClient.Heartbeat(ctx, hbReq)
		if err != nil {
			return fmt.Errorf("heartbeat API error: %w", err)
		}

		// Act on the collector election result.
		manageCollector(ctx, apiClient, cfg, hbResp)

		// Self-update if the control plane advertises a newer build.
		if hbResp.Update != nil && hbResp.Update.Version != "" && hbResp.Update.Version != version.Version {
			log.Printf("[update] new version %s available (running %s) — updating...", hbResp.Update.Version, version.Version)
			go func(u client.AgentUpdate) {
				if err := updater.Apply(updater.Update{Version: u.Version, URL: u.URL, SHA256: u.SHA256}); err != nil {
					log.Printf("[update] failed: %v", err)
				}
			}(*hbResp.Update)
		}

		log.Printf("[+] Heartbeat acknowledged at %s (CPU: %.1f%%, RAM: %.1f%%, Disk: %.1f%%, Uptime: %.2fd)",
			hbResp.ServerTime, metrics.CpuUsage, metrics.RamUsage, metrics.DiskUsage, metrics.UptimeDays)

		// Process pending commands if any
		if len(hbResp.PendingCommands) > 0 {
			log.Printf("[*] Received %d pending command(s)", len(hbResp.PendingCommands))
			for _, cmd := range hbResp.PendingCommands {
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
		interval = 10
	}

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
		case sig := <-sigChan:
			log.Printf("[*] Received signal %v. Shutting down agent gracefully.", sig)
			return
		}
	}
	})
}
