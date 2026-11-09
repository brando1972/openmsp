// Package e2ee implements the ApexMSP v2 End-to-End Encryption (E2EE) and
// mutual cryptographic authentication envelope between the Go endpoint agent
// and the Control Plane API.
//
// Cryptographic primitives (100% standard library + golang.org/x/crypto):
//   - Key Agreement:  X25519 (RFC 7748) -> SHA-256 KDF bound to both public keys
//   - AEAD Cipher:    ChaCha20-Poly1305 (RFC 8439, 256-bit key, 96-bit nonce, 128-bit tag)
//   - Digital Sig:    Ed25519 (RFC 8032) over canonical header + SHA-256(ciphertext)
//   - Replay Guard:   Unix millisecond timestamp (±120s window) + 96-bit random nonce
package e2ee

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/chacha20poly1305"
	"golang.org/x/crypto/curve25519"
)

const (
	EnvelopeVersion = "v2-e2ee"
	MaxClockSkew    = 120 * time.Second
)

// Identity holds the endpoint's persistent Ed25519 signing keypair and
// X25519 key-agreement keypair (base64-encoded raw bytes).
type Identity struct {
	SignPrivB64 string `json:"signPriv,omitempty"` // 64-byte Ed25519 private key
	SignPubB64  string `json:"signPub,omitempty"`  // 32-byte Ed25519 public key
	BoxPrivB64  string `json:"boxPriv,omitempty"`  // 32-byte X25519 private scalar
	BoxPubB64   string `json:"boxPub,omitempty"`   // 32-byte X25519 public point
}

// IsValid returns true if all 4 key components are present and have valid lengths.
func (id Identity) IsValid() bool {
	signPriv, err1 := base64.StdEncoding.DecodeString(id.SignPrivB64)
	signPub, err2 := base64.StdEncoding.DecodeString(id.SignPubB64)
	boxPriv, err3 := base64.StdEncoding.DecodeString(id.BoxPrivB64)
	boxPub, err4 := base64.StdEncoding.DecodeString(id.BoxPubB64)
	return err1 == nil && err2 == nil && err3 == nil && err4 == nil &&
		len(signPriv) == ed25519.PrivateKeySize &&
		len(signPub) == ed25519.PublicKeySize &&
		len(boxPriv) == curve25519.ScalarSize &&
		len(boxPub) == curve25519.PointSize
}

// GenerateIdentity creates a fresh Ed25519 signing keypair and X25519 encryption keypair.
func GenerateIdentity() (Identity, error) {
	signPub, signPriv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return Identity{}, fmt.Errorf("generate ed25519 key: %w", err)
	}

	var boxPriv [curve25519.ScalarSize]byte
	if _, err := rand.Read(boxPriv[:]); err != nil {
		return Identity{}, fmt.Errorf("generate x25519 scalar: %w", err)
	}
	boxPub, err := curve25519.X25519(boxPriv[:], curve25519.Basepoint)
	if err != nil {
		return Identity{}, fmt.Errorf("compute x25519 public key: %w", err)
	}

	return Identity{
		SignPrivB64: base64.StdEncoding.EncodeToString(signPriv),
		SignPubB64:  base64.StdEncoding.EncodeToString(signPub),
		BoxPrivB64:  base64.StdEncoding.EncodeToString(boxPriv[:]),
		BoxPubB64:   base64.StdEncoding.EncodeToString(boxPub),
	}, nil
}

// Envelope is the wire format for encrypted agent <-> server requests and responses.
type Envelope struct {
	V            string `json:"v"`                  // "v2-e2ee"
	DeviceId     string `json:"deviceId"`           // enrolled device ID
	SenderBoxPub string `json:"senderBoxPub"`       // sender's 32-byte X25519 pubkey (b64)
	SenderSignPub string `json:"senderSignPub,omitempty"` // sender's 32-byte Ed25519 pubkey (b64)
	Timestamp    int64  `json:"ts"`                 // Unix timestamp in milliseconds
	Nonce        string `json:"nonce"`              // 12-byte random nonce (b64)
	Ciphertext   string `json:"ct"`                 // ChaCha20-Poly1305 ciphertext + 16B tag (b64)
	Signature    string `json:"sig"`                // 64-byte Ed25519 signature (b64)
}

// DeriveSharedKey computes the 32-byte symmetric ChaCha20-Poly1305 key using X25519 ECDH
// bound to the sorted/directional public keys via SHA-256 domain separation.
// Both client and server pass (deviceBoxPubB64, serverBoxPubB64) in that fixed order
// so both sides derive the exact same 32-byte key.
func DeriveSharedKey(myBoxPrivB64, peerBoxPubB64, deviceBoxPubB64, serverBoxPubB64 string) ([]byte, error) {
	privBytes, err := base64.StdEncoding.DecodeString(myBoxPrivB64)
	if err != nil || len(privBytes) != curve25519.ScalarSize {
		return nil, errors.New("invalid local X25519 private key")
	}
	peerBytes, err := base64.StdEncoding.DecodeString(peerBoxPubB64)
	if err != nil || len(peerBytes) != curve25519.PointSize {
		return nil, errors.New("invalid peer X25519 public key")
	}
	shared, err := curve25519.X25519(privBytes, peerBytes)
	if err != nil {
		return nil, fmt.Errorf("x25519 key agreement failed: %w", err)
	}

	h := sha256.New()
	h.Write([]byte("apexmsp-e2ee-v2:"))
	h.Write(shared)
	h.Write([]byte(":"))
	h.Write([]byte(deviceBoxPubB64))
	h.Write([]byte(":"))
	h.Write([]byte(serverBoxPubB64))
	return h.Sum(nil), nil
}

func buildAAD(deviceId string, ts int64, nonceB64 string) []byte {
	return []byte("apexmsp-aad-v2:" + deviceId + ":" + strconv.FormatInt(ts, 10) + ":" + nonceB64)
}

func buildSignPayload(deviceId string, ts int64, nonceB64, senderBoxPubB64 string, ciphertext []byte) []byte {
	ctHash := sha256.Sum256(ciphertext)
	ctHex := hex.EncodeToString(ctHash[:])
	return []byte("apexmsp-sig-v2:" + deviceId + ":" + strconv.FormatInt(ts, 10) + ":" + nonceB64 + ":" + senderBoxPubB64 + ":" + ctHex)
}

// Seal encrypts and signs plaintext from the endpoint agent to the Control Plane.
func Seal(deviceId string, id Identity, serverBoxPubB64 string, plaintext []byte) (*Envelope, error) {
	if !id.IsValid() {
		return nil, errors.New("agent E2EE identity is not initialized")
	}
	key, err := DeriveSharedKey(id.BoxPrivB64, serverBoxPubB64, id.BoxPubB64, serverBoxPubB64)
	if err != nil {
		return nil, err
	}
	aead, err := chacha20poly1305.New(key)
	if err != nil {
		return nil, err
	}

	nonce := make([]byte, chacha20poly1305.NonceSize)
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	nonceB64 := base64.StdEncoding.EncodeToString(nonce)
	ts := time.Now().UnixMilli()

	aad := buildAAD(deviceId, ts, nonceB64)
	ct := aead.Seal(nil, nonce, plaintext, aad)

	signPrivBytes, err := base64.StdEncoding.DecodeString(id.SignPrivB64)
	if err != nil || len(signPrivBytes) != ed25519.PrivateKeySize {
		return nil, errors.New("invalid Ed25519 private key")
	}
	sigPayload := buildSignPayload(deviceId, ts, nonceB64, id.BoxPubB64, ct)
	sig := ed25519.Sign(ed25519.PrivateKey(signPrivBytes), sigPayload)

	return &Envelope{
		V:             EnvelopeVersion,
		DeviceId:      deviceId,
		SenderBoxPub:  id.BoxPubB64,
		SenderSignPub: id.SignPubB64,
		Timestamp:     ts,
		Nonce:         nonceB64,
		Ciphertext:    base64.StdEncoding.EncodeToString(ct),
		Signature:     base64.StdEncoding.EncodeToString(sig),
	}, nil
}

// Open verifies the Control Plane's Ed25519 signature, checks the timestamp replay window,
// and decrypts the ChaCha20-Poly1305 ciphertext back into plaintext.
func Open(env *Envelope, id Identity, serverBoxPubB64, serverSignPubB64 string) ([]byte, error) {
	if env == nil || env.V != EnvelopeVersion {
		return nil, errors.New("unsupported envelope version")
	}
	nowMs := time.Now().UnixMilli()
	diff := nowMs - env.Timestamp
	if diff < 0 {
		diff = -diff
	}
	if diff > MaxClockSkew.Milliseconds() {
		return nil, fmt.Errorf("envelope timestamp outside replay window (skew %dms)", diff)
	}

	ct, err := base64.StdEncoding.DecodeString(env.Ciphertext)
	if err != nil {
		return nil, fmt.Errorf("decode ciphertext: %w", err)
	}
	nonce, err := base64.StdEncoding.DecodeString(env.Nonce)
	if err != nil || len(nonce) != chacha20poly1305.NonceSize {
		return nil, errors.New("invalid envelope nonce")
	}

	// Verify server Ed25519 signature if serverSignPubB64 is known
	signPubToUse := serverSignPubB64
	if signPubToUse == "" {
		signPubToUse = env.SenderSignPub
	}
	if signPubToUse != "" {
		pubBytes, err := base64.StdEncoding.DecodeString(signPubToUse)
		if err != nil || len(pubBytes) != ed25519.PublicKeySize {
			return nil, errors.New("invalid server Ed25519 public key")
		}
		sigBytes, err := base64.StdEncoding.DecodeString(env.Signature)
		if err != nil || len(sigBytes) != ed25519.SignatureSize {
			return nil, errors.New("invalid envelope Ed25519 signature")
		}
		sigPayload := buildSignPayload(env.DeviceId, env.Timestamp, env.Nonce, env.SenderBoxPub, ct)
		if !ed25519.Verify(ed25519.PublicKey(pubBytes), sigPayload, sigBytes) {
			return nil, errors.New("envelope Ed25519 signature verification failed")
		}
	}

	peerBoxPub := serverBoxPubB64
	if peerBoxPub == "" {
		peerBoxPub = env.SenderBoxPub
	}
	key, err := DeriveSharedKey(id.BoxPrivB64, peerBoxPub, id.BoxPubB64, peerBoxPub)
	if err != nil {
		return nil, err
	}
	aead, err := chacha20poly1305.New(key)
	if err != nil {
		return nil, err
	}

	aad := buildAAD(env.DeviceId, env.Timestamp, env.Nonce)
	plaintext, err := aead.Open(nil, nonce, ct, aad)
	if err != nil {
		return nil, fmt.Errorf("aead decrypt failed: %w", err)
	}
	return plaintext, nil
}

// VerifyReleaseSignature checks an Ed25519 signature over a binary release manifest entry
// ("apexmsp-release-v1:<version>:<os>/<arch>:<sha256>").
func VerifyReleaseSignature(releasePubKeyB64, version, osArch, sha256Hex, signatureB64 string) error {
	pubBytes, err := base64.StdEncoding.DecodeString(releasePubKeyB64)
	if err != nil || len(pubBytes) != ed25519.PublicKeySize {
		return errors.New("invalid release signing public key")
	}
	sigBytes, err := base64.StdEncoding.DecodeString(signatureB64)
	if err != nil || len(sigBytes) != ed25519.SignatureSize {
		return errors.New("invalid release signature encoding")
	}
	msg := []byte(fmt.Sprintf("apexmsp-release-v1:%s:%s:%s", version, osArch, strings.ToLower(strings.TrimSpace(sha256Hex))))
	if !ed25519.Verify(ed25519.PublicKey(pubBytes), msg, sigBytes) {
		return errors.New("release binary Ed25519 signature verification failed")
	}
	return nil
}

// VerifyCommandSignature checks the Control Plane's Ed25519 signature on a dispatched DeviceCommand
// ("apexmsp-cmd-v1:<id>:<deviceId>:<commandType>:<sha256(script)>:<actionType>:<targetPath>:<hostname>").
func VerifyCommandSignature(serverSignPubB64, cmdID, deviceID, commandType string, payload map[string]interface{}, signatureB64 string) error {
	pubBytes, err := base64.StdEncoding.DecodeString(serverSignPubB64)
	if err != nil || len(pubBytes) != ed25519.PublicKeySize {
		return errors.New("invalid server Ed25519 public key")
	}
	sigBytes, err := base64.StdEncoding.DecodeString(signatureB64)
	if err != nil || len(sigBytes) != ed25519.SignatureSize {
		return errors.New("invalid command Ed25519 signature")
	}
	getStr := func(k string) string {
		if payload == nil {
			return ""
		}
		if v, ok := payload[k].(string); ok {
			return v
		}
		return ""
	}
	scriptHash := sha256.Sum256([]byte(getStr("script")))
	scriptHex := hex.EncodeToString(scriptHash[:])
	msg := []byte(fmt.Sprintf("apexmsp-cmd-v1:%s:%s:%s:%s:%s:%s:%s",
		cmdID, deviceID, commandType, scriptHex, getStr("actionType"), getStr("targetPath"), getStr("hostname")))
	if !ed25519.Verify(ed25519.PublicKey(pubBytes), msg, sigBytes) {
		return errors.New("command Ed25519 signature verification failed")
	}
	return nil
}
