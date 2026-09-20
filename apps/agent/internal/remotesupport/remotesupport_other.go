//go:build !windows

package remotesupport

// EnsureWindowsSync is a no-op on non-Windows platforms.
func EnsureWindowsSync() {}
