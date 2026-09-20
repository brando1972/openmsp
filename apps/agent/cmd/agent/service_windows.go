//go:build windows

package main

import (
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"openmsp/agent/internal/remotesupport"

	"golang.org/x/sys/windows/svc"
)

func runService(runAgent func()) {
	isSvc, err := svc.IsWindowsService()
	if err != nil {
		log.Printf("[!] Error checking if Windows service: %v", err)
	}
	if !isSvc {
		runAgent()
		return
	}

	err = svc.Run("ApexMSPAgent", &agentService{runAgent: runAgent})
	if err != nil {
		log.Fatalf("[-] Failed to run Windows service: %v", err)
	}
}

type agentService struct {
	runAgent func()
}

func (m *agentService) Execute(args []string, r <-chan svc.ChangeRequest, changes chan<- svc.Status) (bool, uint32) {
	changes <- svc.Status{State: svc.StartPending}
	go m.runAgent()
	changes <- svc.Status{State: svc.Running, Accepts: svc.AcceptStop | svc.AcceptShutdown}

	for c := range r {
		switch c.Cmd {
		case svc.Interrogate:
			changes <- c.CurrentStatus
		case svc.Stop, svc.Shutdown:
			changes <- svc.Status{State: svc.StopPending}
			return false, 0
		}
	}
	return false, 0
}

func installWindowsService(configFile string) error {
	progData := os.Getenv("ProgramData")
	if progData == "" {
		progData = `C:\ProgramData`
	}
	targetDir := filepath.Join(progData, "ApexMSP")
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return fmt.Errorf("failed to create directory %s: %w", targetDir, err)
	}

	targetExe := filepath.Join(targetDir, "openmsp-agent.exe")
	currentExe, err := os.Executable()
	if err == nil && filepath.Clean(currentExe) != filepath.Clean(targetExe) {
		src, err := os.Open(currentExe)
		if err == nil {
			dst, err := os.OpenFile(targetExe, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
			if err == nil {
				io.Copy(dst, src)
				dst.Close()
			}
			src.Close()
		}
	}

	targetConfig := filepath.Join(targetDir, "openmsp-agent.json")
	if configFile != "" && filepath.Clean(configFile) != filepath.Clean(targetConfig) {
		if cBytes, err := os.ReadFile(configFile); err == nil {
			os.WriteFile(targetConfig, cBytes, 0644)
		}
	}

	binPath := fmt.Sprintf("\"%s\" --config \"%s\"", targetExe, targetConfig)
	_ = exec.Command("sc.exe", "stop", "ApexMSPAgent").Run()
	_ = exec.Command("sc.exe", "delete", "ApexMSPAgent").Run()
	time.Sleep(300 * time.Millisecond)

	createCmd := exec.Command("sc.exe", "create", "ApexMSPAgent", "binPath=", binPath, "start=", "auto", "DisplayName=", "ApexMSP Endpoint Agent")
	if out, err := createCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("sc create failed: %s (%w)", string(out), err)
	}

	_ = exec.Command("sc.exe", "failure", "ApexMSPAgent", "reset=", "86400", "actions=", "restart/5000/restart/10000/restart/60000").Run()
	_ = exec.Command("sc.exe", "start", "ApexMSPAgent").Run()
	log.Printf("[+] Registered and started Windows Service 'ApexMSPAgent' at %s", targetExe)

	// Ensure embedded MeshAgent and Shark Fin tray icon are provisioned synchronously
	remotesupport.EnsureWindowsSync()

	return nil
}
