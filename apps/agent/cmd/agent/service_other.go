//go:build !windows

package main

func runService(runAgent func()) {
	runAgent()
}

func installWindowsService(configFile string) error {
	return nil
}
