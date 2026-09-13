//go:build tray

// Package tray renders the OpenMSP status-bar (macOS) / system-tray (Windows)
// icon and menu. Built only with `-tags tray` (requires CGO on macOS).
package tray

import (
	_ "embed"
	"runtime"

	"fyne.io/systray"
)

//go:embed assets/iconTemplate.png
var iconTemplate []byte

//go:embed assets/icon.ico
var iconWindows []byte

//go:embed assets/icon.png
var iconPNG []byte

// Callbacks wire menu items to agent behavior. Any nil callback is ignored.
type Callbacks struct {
	OnCreateTicket func() // "Create Ticket…"
	OnSyncNow      func() // "Sync Now" — trigger an immediate heartbeat
	OnOpenConsole  func() // "Open Console"
	OnQuit         func() // called just before the process exits
}

// Supported reports whether this build includes the tray UI.
func Supported() bool { return true }

// Run takes over the main thread and shows the tray until Quit is called.
// It MUST be invoked from the main goroutine; run the agent loop separately.
func Run(cb Callbacks) {
	systray.Run(func() { onReady(cb) }, func() {
		if cb.OnQuit != nil {
			cb.OnQuit()
		}
	})
}

// Quit tears down the tray and causes Run to return.
func Quit() { systray.Quit() }

func onReady(cb Callbacks) {
	if runtime.GOOS == "windows" {
		systray.SetIcon(iconWindows)
	} else {
		// macOS: template icon adapts to light/dark menu bar automatically.
		systray.SetTemplateIcon(iconTemplate, iconPNG)
	}
	systray.SetTooltip("OpenMSP Agent")

	mStatus := systray.AddMenuItem("OpenMSP Agent", "")
	mStatus.Disable()
	systray.AddSeparator()

	mTicket := systray.AddMenuItem("Create Ticket…", "Open a support ticket")
	mSync := systray.AddMenuItem("Sync Now", "Send a heartbeat now")
	mConsole := systray.AddMenuItem("Open Console", "Open the OpenMSP console")
	systray.AddSeparator()
	mQuit := systray.AddMenuItem("Quit", "Quit the OpenMSP agent")

	go func() {
		for {
			select {
			case <-mTicket.ClickedCh:
				if cb.OnCreateTicket != nil {
					cb.OnCreateTicket()
				}
			case <-mSync.ClickedCh:
				if cb.OnSyncNow != nil {
					cb.OnSyncNow()
				}
			case <-mConsole.ClickedCh:
				if cb.OnOpenConsole != nil {
					cb.OnOpenConsole()
				}
			case <-mQuit.ClickedCh:
				systray.Quit()
				return
			}
		}
	}()
}
