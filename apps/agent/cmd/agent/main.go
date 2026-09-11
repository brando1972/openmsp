package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"openmsp/agent/internal/client"
	"openmsp/agent/internal/collector"
	"openmsp/agent/internal/config"
	"openmsp/agent/internal/executor"
)

func main() {
	serverFlag := flag.String("server", "http://localhost:3001", "API base URL")
	tokenFlag := flag.String("token", "", "One-time enrollment token (e.g. demo-enrollment-token-2026)")
	configFlag := flag.String("config", "openmsp-agent.json", "Path to local config JSON")
	runOnceFlag := flag.Bool("run-once", false, "Run a single heartbeat and exit")
	intervalFlag := flag.Int("interval", 30, "Heartbeat interval in seconds")

	flag.Parse()

	log.Println("[*] OpenMSP Device Agent starting...")

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

		hbReq := client.AgentHeartbeatRequest{
			DeviceId:      cfg.DeviceId,
			DeviceSecret:  cfg.DeviceSecret,
			Metrics:       metrics,
			Network:       network,
			InstalledApps: installedApps,
			Services:      services,
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
		interval = 30
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
}
