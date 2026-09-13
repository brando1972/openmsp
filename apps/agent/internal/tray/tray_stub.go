//go:build !tray

// Package tray no-op stub for headless builds (default). The real UI is
// compiled only with `-tags tray`.
package tray

// Callbacks mirrors the tray build's type so callers compile unchanged.
type Callbacks struct {
	OnCreateTicket func()
	OnSyncNow      func()
	OnOpenConsole  func()
	OnQuit         func()
}

// Supported reports whether this build includes the tray UI (false here).
func Supported() bool { return false }

// Run is a no-op in headless builds; it returns immediately.
func Run(cb Callbacks) {}

// Quit is a no-op in headless builds.
func Quit() {}
