package e2ee

import (
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"testing"
	"time"

	"golang.org/x/crypto/chacha20poly1305"
)

func TestGenerateIdentityAndRoundtripSealOpen(t *testing.T) {
	agentID, err := GenerateIdentity()
	if err != nil {
		t.Fatalf("GenerateIdentity(agent) failed: %v", err)
	}
	if !agentID.IsValid() {
		t.Fatalf("expected agentID.IsValid() == true")
	}

	serverID, err := GenerateIdentity()
	if err != nil {
		t.Fatalf("GenerateIdentity(server) failed: %v", err)
	}

	plaintext := []byte(`{"deviceId":"dev-mac-001","metrics":{"cpuUsage":12.4,"ramUsage":41.2}}`)
	env, err := Seal("dev-mac-001", agentID, serverID.BoxPubB64, plaintext)
	if err != nil {
		t.Fatalf("Seal failed: %v", err)
	}

	// Simulate server opening agent's envelope:
	// Note that server derives shared key with (serverBoxPriv, agentBoxPub, agentBoxPub, serverBoxPub)
	key, err := DeriveSharedKey(serverID.BoxPrivB64, agentID.BoxPubB64, agentID.BoxPubB64, serverID.BoxPubB64)
	if err != nil {
		t.Fatalf("server DeriveSharedKey failed: %v", err)
	}
	agentKey, err := DeriveSharedKey(agentID.BoxPrivB64, serverID.BoxPubB64, agentID.BoxPubB64, serverID.BoxPubB64)
	if err != nil {
		t.Fatalf("agent DeriveSharedKey failed: %v", err)
	}
	if !bytes.Equal(key, agentKey) {
		t.Fatalf("ECDH derived keys do not match")
	}

	// Now test server sealing a response back to the agent and agent calling Open():
	serverReplyPlain := []byte(`{"acknowledged":true,"commands":[{"id":"cmd-1","commandType":"collect_inventory"}]}`)
	// Server seals using identical directional KDF (deviceBoxPub, serverBoxPub)
	serverEnv, err := sealFromServer("dev-mac-001", serverID, agentID.BoxPubB64, serverReplyPlain)
	if err != nil {
		t.Fatalf("sealFromServer failed: %v", err)
	}

	opened, err := Open(serverEnv, agentID, serverID.BoxPubB64, serverID.SignPubB64)
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}
	if !bytes.Equal(opened, serverReplyPlain) {
		t.Fatalf("decrypted payload mismatch: got %s, want %s", string(opened), string(serverReplyPlain))
	}

	// Tamper with ciphertext -> must fail signature and AEAD check
	tampered := *serverEnv
	tampered.Timestamp = serverEnv.Timestamp + 1
	if _, err := Open(&tampered, agentID, serverID.BoxPubB64, serverID.SignPubB64); err == nil {
		t.Fatalf("expected Open to reject tampered timestamp")
	}

	// Expired timestamp -> must fail replay window check
	expired := *serverEnv
	expired.Timestamp = time.Now().Add(-5 * time.Minute).UnixMilli()
	if _, err := Open(&expired, agentID, serverID.BoxPubB64, serverID.SignPubB64); err == nil {
		t.Fatalf("expected Open to reject expired replay window")
	}

	// unused variable check for env
	if env.V != EnvelopeVersion {
		t.Fatalf("unexpected version %s", env.V)
	}
}

func sealFromServer(deviceId string, serverID Identity, deviceBoxPubB64 string, plaintext []byte) (*Envelope, error) {
	// Server uses DeriveSharedKey(serverBoxPriv, deviceBoxPub, deviceBoxPub, serverBoxPub)
	// Notice Seal() passes (id.BoxPubB64, peerBoxPubB64), so for test helper we construct directly:
	key, err := DeriveSharedKey(serverID.BoxPrivB64, deviceBoxPubB64, deviceBoxPubB64, serverID.BoxPubB64)
	if err != nil {
		return nil, err
	}
	aead, err := chacha20poly1305.New(key)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, chacha20poly1305.NonceSize)
	nonceB64 := base64.StdEncoding.EncodeToString(nonce)
	ts := time.Now().UnixMilli()
	aad := buildAAD(deviceId, ts, nonceB64)
	ct := aead.Seal(nil, nonce, plaintext, aad)

	signPriv, _ := base64.StdEncoding.DecodeString(serverID.SignPrivB64)
	sigPayload := buildSignPayload(deviceId, ts, nonceB64, serverID.BoxPubB64, ct)
	sig := ed25519.Sign(ed25519.PrivateKey(signPriv), sigPayload)

	return &Envelope{
		V:             EnvelopeVersion,
		DeviceId:      deviceId,
		SenderBoxPub:  serverID.BoxPubB64,
		SenderSignPub: serverID.SignPubB64,
		Timestamp:     ts,
		Nonce:         nonceB64,
		Ciphertext:    base64.StdEncoding.EncodeToString(ct),
		Signature:     base64.StdEncoding.EncodeToString(sig),
	}, nil
}

func TestReleaseAndCommandSignatures(t *testing.T) {
	srvID, err := GenerateIdentity()
	if err != nil {
		t.Fatalf("GenerateIdentity failed: %v", err)
	}
	signPriv, _ := base64.StdEncoding.DecodeString(srvID.SignPrivB64)

	// 1. Release signature verification
	relMsg := []byte("apexmsp-release-v1:2.2.0:darwin/arm64:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
	relSig := base64.StdEncoding.EncodeToString(ed25519.Sign(ed25519.PrivateKey(signPriv), relMsg))

	if err := VerifyReleaseSignature(srvID.SignPubB64, "2.2.0", "darwin/arm64", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", relSig); err != nil {
		t.Fatalf("VerifyReleaseSignature failed: %v", err)
	}
	if err := VerifyReleaseSignature(srvID.SignPubB64, "2.2.1", "darwin/arm64", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", relSig); err == nil {
		t.Fatalf("expected tampered version to fail release signature verification")
	}

	// 2. Per-command Ed25519 signature verification
	cmdPayload := map[string]interface{}{
		"script":     "echo 'hello secure endpoint'",
		"actionType": "run_script",
	}
	scriptHash := sha256.Sum256([]byte("echo 'hello secure endpoint'"))
	cmdMsg := []byte("apexmsp-cmd-v1:cmd-99:dev-test-001:run_script:" + hex.EncodeToString(scriptHash[:]) + ":run_script::")
	cmdSig := base64.StdEncoding.EncodeToString(ed25519.Sign(ed25519.PrivateKey(signPriv), cmdMsg))

	if err := VerifyCommandSignature(srvID.SignPubB64, "cmd-99", "dev-test-001", "run_script", cmdPayload, cmdSig); err != nil {
		t.Fatalf("VerifyCommandSignature failed: %v", err)
	}
	cmdPayload["script"] = "rm -rf /"
	if err := VerifyCommandSignature(srvID.SignPubB64, "cmd-99", "dev-test-001", "run_script", cmdPayload, cmdSig); err == nil {
		t.Fatalf("expected modified script payload to fail command signature verification")
	}
}
