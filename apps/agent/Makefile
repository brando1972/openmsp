# OpenMSP device agent build

VERSION ?= 0.2.0-dev
LDFLAGS := -s -w -X main.Version=$(VERSION)
PKG := ./cmd/agent
BIN := bin

# Code-signing / notarization (macOS). Set these in your env or CI.
DEVELOPER_ID ?=                        # e.g. "Developer ID Application: Your Co (TEAMID)"
NOTARY_PROFILE ?=                      # notarytool keychain profile name

.PHONY: all build build-macos build-all clean vet sign notarize

all: build-all

# Native build for the current machine
build:
	CGO_ENABLED=0 go build -ldflags "$(LDFLAGS)" -o $(BIN)/openmsp-agent $(PKG)

# Universal macOS binary (arm64 + amd64) -> bin/openmsp-agent-darwin
build-macos:
	CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -ldflags "$(LDFLAGS)" -o $(BIN)/openmsp-agent-darwin-arm64 $(PKG)
	CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o $(BIN)/openmsp-agent-darwin-amd64 $(PKG)
	lipo -create -output $(BIN)/openmsp-agent-darwin $(BIN)/openmsp-agent-darwin-arm64 $(BIN)/openmsp-agent-darwin-amd64 || \
		cp $(BIN)/openmsp-agent-darwin-arm64 $(BIN)/openmsp-agent-darwin

build-all: build-macos
	CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o $(BIN)/openmsp-agent.exe $(PKG)
	CGO_ENABLED=0 GOOS=linux   GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o $(BIN)/openmsp-agent-linux-amd64 $(PKG)

# --- Tray builds (status-bar / system-tray icon) ---
# macOS tray requires CGO (Cocoa) and must be built ON a Mac with Xcode CLT.
build-macos-tray:
	CGO_ENABLED=1 GOOS=darwin GOARCH=arm64 go build -tags tray -ldflags "$(LDFLAGS)" -o $(BIN)/openmsp-agent-tray-darwin-arm64 $(PKG)

# Windows tray is pure-Go (no CGO), so it cross-compiles anywhere.
build-windows-tray:
	CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -tags tray -ldflags "$(LDFLAGS)" -o $(BIN)/openmsp-agent-tray.exe $(PKG)

vet:
	go vet ./...

# Sign the universal macOS binary with a hardened runtime (required for notarization)
sign:
	@test -n "$(DEVELOPER_ID)" || (echo "Set DEVELOPER_ID"; exit 1)
	codesign --force --options runtime --timestamp --sign "$(DEVELOPER_ID)" $(BIN)/openmsp-agent-darwin

# Notarize (submit the signed binary in a zip, then staple is N/A for bare binaries)
notarize:
	@test -n "$(NOTARY_PROFILE)" || (echo "Set NOTARY_PROFILE"; exit 1)
	ditto -c -k --keepParent $(BIN)/openmsp-agent-darwin $(BIN)/openmsp-agent-darwin.zip
	xcrun notarytool submit $(BIN)/openmsp-agent-darwin.zip --keychain-profile "$(NOTARY_PROFILE)" --wait

clean:
	rm -rf $(BIN)
