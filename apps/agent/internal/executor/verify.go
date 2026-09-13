package executor

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"

	"openmsp/agent/internal/client"
)

// CanonicalCommandBytes produces the deterministic byte representation of a
// command that the control plane signs and the agent verifies. Payload is
// marshaled with encoding/json, which sorts map keys, so the encoding is stable.
func CanonicalCommandBytes(cmd client.DeviceCommand) ([]byte, error) {
	payloadJSON, err := json.Marshal(cmd.Payload)
	if err != nil {
		return nil, fmt.Errorf("marshal payload: %w", err)
	}
	canonical := fmt.Sprintf("%s|%s|%s|%s", cmd.ID, cmd.DeviceId, cmd.CommandType, string(payloadJSON))
	return []byte(canonical), nil
}

// Verifier checks Ed25519 signatures on dispatched commands.
type Verifier struct {
	pub ed25519.PublicKey // nil => verification disabled (backward compatible)
}

// NewVerifier builds a Verifier from a base64-encoded Ed25519 public key.
// An empty key disables verification (the agent will run unsigned commands but
// callers should warn). An invalid key is an error.
func NewVerifier(b64Key string) (*Verifier, error) {
	if b64Key == "" {
		return &Verifier{pub: nil}, nil
	}
	raw, err := base64.StdEncoding.DecodeString(b64Key)
	if err != nil {
		return nil, fmt.Errorf("decode server public key: %w", err)
	}
	if len(raw) != ed25519.PublicKeySize {
		return nil, fmt.Errorf("server public key must be %d bytes, got %d", ed25519.PublicKeySize, len(raw))
	}
	return &Verifier{pub: ed25519.PublicKey(raw)}, nil
}

// Enabled reports whether signature verification is active.
func (v *Verifier) Enabled() bool { return v != nil && v.pub != nil }

// Verify returns nil if the command signature is valid (or verification is
// disabled). It returns an error when a key is configured and the signature is
// missing or invalid — such commands must not be executed.
func (v *Verifier) Verify(cmd client.DeviceCommand) error {
	if !v.Enabled() {
		return nil
	}
	if cmd.Signature == "" {
		return errors.New("command has no signature but verification is enabled")
	}
	sig, err := base64.StdEncoding.DecodeString(cmd.Signature)
	if err != nil {
		return fmt.Errorf("decode signature: %w", err)
	}
	msg, err := CanonicalCommandBytes(cmd)
	if err != nil {
		return err
	}
	if !ed25519.Verify(v.pub, msg, sig) {
		return errors.New("command signature verification failed")
	}
	return nil
}
