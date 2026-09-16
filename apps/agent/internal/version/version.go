// Package version is the single source of truth for the agent's build version.
// Bump Version when cutting a release, cross-compile, and publish the artifacts +
// manifest (see scripts/release-agent.sh). Agents compare this against the
// control plane's advertised latest on every heartbeat and self-update.
package version

// Version is the compiled agent version (semver: MAJOR.MINOR.PATCH).
const Version = "1.3.0"
