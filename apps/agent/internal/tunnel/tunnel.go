// Package tunnel is the collector's on-LAN reach-through data plane.
//
// The elected site collector holds one persistent WebSocket to the control
// plane. Over it, the control plane opens short-lived sessions to devices the
// collector already discovered on the LAN (the SSRF guard lives server-side),
// and the collector pipes the bytes. Nothing at the client site needs an open
// inbound port — every byte rides the collector's outbound connection.
//
// v1 brokers SSH: the collector terminates the SSH protocol locally (Go's
// x/crypto/ssh) and streams a PTY's I/O to the browser's terminal, so the
// browser only ever handles plaintext terminal bytes and never the SSH wire
// protocol. Target credentials arrive per-session over the authenticated
// channel and are never written to disk. Web-UI reverse-proxy sessions reuse
// the same channel and land in a later revision.
//
// Framing on the wire:
//   - control messages are JSON text frames ({"t":"open"|"ready"|"error"|
//     "close"|"resize"|"hello", ...});
//   - payload bytes are binary frames: 2-byte big-endian sid length, the
//     session id, then the raw bytes.
//
// A single writer goroutine owns the socket (gorilla/websocket forbids
// concurrent writers); every producer feeds it through an outbound channel.
package tunnel

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"golang.org/x/crypto/ssh"
)

// Config is the collector identity + endpoint the tunnel dials with.
type Config struct {
	ServerURL    string // e.g. https://api.apexmsp.app  (http(s) → ws(s))
	DeviceId     string
	DeviceSecret string
	SiteId       string
	OrgId        string
}

// wire message (control frames). Fields are a superset across directions.
type msg struct {
	T        string `json:"t"`
	Sid      string `json:"sid,omitempty"`
	Kind     string `json:"kind,omitempty"` // "ssh" | "web"
	Host     string `json:"host,omitempty"`
	Port     int    `json:"port,omitempty"`
	Cols     int    `json:"cols,omitempty"`
	Rows     int    `json:"rows,omitempty"`
	Msg      string `json:"msg,omitempty"`
	// hello (collector → control plane)
	DeviceId string `json:"deviceId,omitempty"`
	Secret   string `json:"secret,omitempty"`
	SiteId   string `json:"siteId,omitempty"`
	OrgId    string `json:"orgId,omitempty"`
	// auth (control plane → collector, for ssh open)
	Auth *authInfo `json:"auth,omitempty"`
}

type authInfo struct {
	Username   string `json:"username"`
	Password   string `json:"password,omitempty"`
	PrivateKey string `json:"privateKey,omitempty"`
	Passphrase string `json:"passphrase,omitempty"`
}

type outFrame struct {
	binary bool
	data   []byte
}

// session is one live reach-through (currently always SSH).
type session struct {
	sid    string
	client *ssh.Client
	sess   *ssh.Session
	stdin  io.WriteCloser
	closed bool
}

// Manager maintains the persistent channel and multiplexes sessions over it.
// It runs whenever this agent holds the collector role and idles otherwise.
type Manager struct {
	mu       sync.Mutex
	cfg      Config
	enabled  bool
	conn     *websocket.Conn
	out      chan outFrame
	sessions map[string]*session
	// generation guards a stale reader/writer from touching a newer conn.
	gen int
}

var mgr = &Manager{sessions: map[string]*session{}}

// Global returns the process-wide tunnel manager.
func Global() *Manager { return mgr }

// Configure sets the collector identity/endpoint (call once at startup).
func (m *Manager) Configure(cfg Config) {
	m.mu.Lock()
	m.cfg = cfg
	m.mu.Unlock()
}

// SetEnabled turns the tunnel channel on (collector) or off (not collector).
// Disabling tears down the socket and all live sessions.
func (m *Manager) SetEnabled(on bool) {
	m.mu.Lock()
	was := m.enabled
	m.enabled = on
	conn := m.conn
	m.mu.Unlock()
	if on && !was {
		log.Printf("[tunnel] collector reach-through enabled")
	}
	if !on && was {
		log.Printf("[tunnel] collector reach-through disabled")
		if conn != nil {
			conn.Close() // reader loop will observe and clean up
		}
	}
}

func (m *Manager) isEnabled() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.enabled
}

// Run is the supervisor loop: while enabled, keep a connection up with backoff.
// Call once in a goroutine at startup; it returns when ctx is cancelled.
func (m *Manager) Run(ctx context.Context) {
	backoff := time.Second
	for {
		if ctx.Err() != nil {
			return
		}
		if !m.isEnabled() {
			time.Sleep(time.Second)
			continue
		}
		if err := m.connectAndServe(ctx); err != nil {
			if m.isEnabled() {
				log.Printf("[tunnel] channel error: %v (reconnecting in %s)", err, backoff)
			}
			select {
			case <-ctx.Done():
				return
			case <-time.After(backoff):
			}
			backoff *= 2
			if backoff > 30*time.Second {
				backoff = 30 * time.Second
			}
			continue
		}
		backoff = time.Second
	}
}

func (m *Manager) wsURL() (string, error) {
	m.mu.Lock()
	base := m.cfg.ServerURL
	m.mu.Unlock()
	u, err := url.Parse(strings.TrimRight(base, "/"))
	if err != nil {
		return "", err
	}
	switch u.Scheme {
	case "https":
		u.Scheme = "wss"
	case "http":
		u.Scheme = "ws"
	}
	u.Path = "/ws/v1/tunnel/collector"
	return u.String(), nil
}

func (m *Manager) connectAndServe(ctx context.Context) error {
	target, err := m.wsURL()
	if err != nil {
		return err
	}
	dialer := websocket.Dialer{HandshakeTimeout: 15 * time.Second}
	conn, _, err := dialer.DialContext(ctx, target, nil)
	if err != nil {
		return fmt.Errorf("dial %s: %w", target, err)
	}

	m.mu.Lock()
	m.conn = conn
	m.gen++
	gen := m.gen
	m.out = make(chan outFrame, 64)
	out := m.out
	cfg := m.cfg
	m.mu.Unlock()

	log.Printf("[tunnel] connected to %s", target)

	// Writer goroutine — sole owner of conn writes.
	writerDone := make(chan struct{})
	go func() {
		defer close(writerDone)
		ping := time.NewTicker(25 * time.Second)
		defer ping.Stop()
		for {
			select {
			case f, ok := <-out:
				if !ok {
					return
				}
				t := websocket.TextMessage
				if f.binary {
					t = websocket.BinaryMessage
				}
				conn.SetWriteDeadline(time.Now().Add(20 * time.Second))
				if err := conn.WriteMessage(t, f.data); err != nil {
					return
				}
			case <-ping.C:
				conn.SetWriteDeadline(time.Now().Add(20 * time.Second))
				if err := conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(10*time.Second)); err != nil {
					return
				}
			}
		}
	}()

	// Authenticate as the site collector.
	m.send(gen, outFrame{data: mustJSON(msg{
		T: "hello", DeviceId: cfg.DeviceId, Secret: cfg.DeviceSecret,
		SiteId: cfg.SiteId, OrgId: cfg.OrgId,
	})})

	conn.SetReadLimit(1 << 20)
	conn.SetPongHandler(func(string) error { return nil })

	// Reader loop (this goroutine).
	var readErr error
	for {
		conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		mt, data, err := conn.ReadMessage()
		if err != nil {
			readErr = err
			break
		}
		if !m.isEnabled() {
			readErr = fmt.Errorf("disabled")
			break
		}
		if mt == websocket.BinaryMessage {
			sid, payload, ok := decodeBin(data)
			if ok {
				m.feedSession(sid, payload)
			}
			continue
		}
		var in msg
		if err := json.Unmarshal(data, &in); err != nil {
			continue
		}
		m.handleControl(gen, in)
	}

	// Teardown: close all sessions bound to this generation, stop writer.
	m.mu.Lock()
	if m.gen == gen {
		close(m.out)
		m.out = nil
		m.conn = nil
	}
	sess := m.sessions
	m.sessions = map[string]*session{}
	m.mu.Unlock()
	for _, s := range sess {
		s.teardown()
	}
	conn.Close()
	<-writerDone
	return readErr
}

// send enqueues a frame for the writer, dropping it if the generation is stale.
func (m *Manager) send(gen int, f outFrame) {
	m.mu.Lock()
	out := m.out
	cur := m.gen
	m.mu.Unlock()
	if out == nil || cur != gen {
		return
	}
	defer func() { _ = recover() }() // out may be closed during teardown race
	select {
	case out <- f:
	case <-time.After(5 * time.Second):
		// backpressure: slow consumer; drop to protect the channel
	}
}

func (m *Manager) handleControl(gen int, in msg) {
	switch in.T {
	case "open":
		go m.openSession(gen, in)
	case "close":
		m.closeSession(in.Sid)
	case "resize":
		m.resizeSession(in.Sid, in.Cols, in.Rows)
	}
}

func (m *Manager) openSession(gen int, in msg) {
	sid := in.Sid
	if in.Kind != "ssh" {
		m.send(gen, outFrame{data: mustJSON(msg{T: "error", Sid: sid, Msg: "unsupported session kind"})})
		return
	}
	if in.Host == "" || in.Auth == nil || in.Auth.Username == "" {
		m.send(gen, outFrame{data: mustJSON(msg{T: "error", Sid: sid, Msg: "missing target or credentials"})})
		return
	}
	port := in.Port
	if port == 0 {
		port = 22
	}

	auths := []ssh.AuthMethod{}
	if in.Auth.PrivateKey != "" {
		var signer ssh.Signer
		var err error
		if in.Auth.Passphrase != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase([]byte(in.Auth.PrivateKey), []byte(in.Auth.Passphrase))
		} else {
			signer, err = ssh.ParsePrivateKey([]byte(in.Auth.PrivateKey))
		}
		if err != nil {
			m.send(gen, outFrame{data: mustJSON(msg{T: "error", Sid: sid, Msg: "invalid private key: " + err.Error()})})
			return
		}
		auths = append(auths, ssh.PublicKeys(signer))
	}
	if in.Auth.Password != "" {
		auths = append(auths, ssh.Password(in.Auth.Password))
		// keyboard-interactive that just echoes the password covers many devices.
		auths = append(auths, ssh.KeyboardInteractive(func(_, _ string, questions []string, _ []bool) ([]string, error) {
			ans := make([]string, len(questions))
			for i := range ans {
				ans[i] = in.Auth.Password
			}
			return ans, nil
		}))
	}

	cfg := &ssh.ClientConfig{
		User:            in.Auth.Username,
		Auth:            auths,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // device host keys are not pre-known in v1
		Timeout:         15 * time.Second,
	}
	addr := net.JoinHostPort(in.Host, fmt.Sprintf("%d", port))
	client, err := ssh.Dial("tcp", addr, cfg)
	if err != nil {
		m.send(gen, outFrame{data: mustJSON(msg{T: "error", Sid: sid, Msg: "connect failed: " + err.Error()})})
		return
	}
	sess, err := client.NewSession()
	if err != nil {
		client.Close()
		m.send(gen, outFrame{data: mustJSON(msg{T: "error", Sid: sid, Msg: "session failed: " + err.Error()})})
		return
	}
	cols, rows := in.Cols, in.Rows
	if cols <= 0 {
		cols = 80
	}
	if rows <= 0 {
		rows = 24
	}
	modes := ssh.TerminalModes{ssh.ECHO: 1, ssh.TTY_OP_ISPEED: 14400, ssh.TTY_OP_OSPEED: 14400}
	if err := sess.RequestPty("xterm-256color", rows, cols, modes); err != nil {
		sess.Close()
		client.Close()
		m.send(gen, outFrame{data: mustJSON(msg{T: "error", Sid: sid, Msg: "pty failed: " + err.Error()})})
		return
	}
	stdin, err := sess.StdinPipe()
	if err != nil {
		sess.Close()
		client.Close()
		m.send(gen, outFrame{data: mustJSON(msg{T: "error", Sid: sid, Msg: "stdin failed: " + err.Error()})})
		return
	}
	// stdout/stderr → binary frames back to the browser.
	pipe := &frameWriter{m: m, gen: gen, sid: sid}
	sess.Stdout = pipe
	sess.Stderr = pipe

	s := &session{sid: sid, client: client, sess: sess, stdin: stdin}
	m.mu.Lock()
	if m.gen != gen { // connection rotated while we were dialing
		m.mu.Unlock()
		s.teardown()
		return
	}
	m.sessions[sid] = s
	m.mu.Unlock()

	if err := sess.Shell(); err != nil {
		m.closeSession(sid)
		m.send(gen, outFrame{data: mustJSON(msg{T: "error", Sid: sid, Msg: "shell failed: " + err.Error()})})
		return
	}
	m.send(gen, outFrame{data: mustJSON(msg{T: "ready", Sid: sid})})
	log.Printf("[tunnel] ssh session %s → %s open", sid, addr)

	// When the remote shell exits, notify the browser and clean up.
	go func() {
		sess.Wait()
		m.send(gen, outFrame{data: mustJSON(msg{T: "close", Sid: sid})})
		m.closeSession(sid)
		log.Printf("[tunnel] ssh session %s closed", sid)
	}()
}

func (m *Manager) feedSession(sid string, payload []byte) {
	m.mu.Lock()
	s := m.sessions[sid]
	m.mu.Unlock()
	if s == nil || s.stdin == nil {
		return
	}
	s.stdin.Write(payload)
}

func (m *Manager) resizeSession(sid string, cols, rows int) {
	if cols <= 0 || rows <= 0 {
		return
	}
	m.mu.Lock()
	s := m.sessions[sid]
	m.mu.Unlock()
	if s != nil && s.sess != nil {
		s.sess.WindowChange(rows, cols)
	}
}

func (m *Manager) closeSession(sid string) {
	m.mu.Lock()
	s := m.sessions[sid]
	delete(m.sessions, sid)
	m.mu.Unlock()
	if s != nil {
		s.teardown()
	}
}

func (s *session) teardown() {
	if s.closed {
		return
	}
	s.closed = true
	if s.stdin != nil {
		s.stdin.Close()
	}
	if s.sess != nil {
		s.sess.Close()
	}
	if s.client != nil {
		s.client.Close()
	}
}

// frameWriter turns an ssh stream's writes into binary session frames.
type frameWriter struct {
	m   *Manager
	gen int
	sid string
}

func (w *frameWriter) Write(p []byte) (int, error) {
	// copy — the ssh reader reuses its buffer.
	cp := make([]byte, len(p))
	copy(cp, p)
	w.m.send(w.gen, outFrame{binary: true, data: encodeBin(w.sid, cp)})
	return len(p), nil
}

func encodeBin(sid string, payload []byte) []byte {
	b := make([]byte, 2+len(sid)+len(payload))
	binary.BigEndian.PutUint16(b[:2], uint16(len(sid)))
	copy(b[2:], sid)
	copy(b[2+len(sid):], payload)
	return b
}

func decodeBin(b []byte) (string, []byte, bool) {
	if len(b) < 2 {
		return "", nil, false
	}
	n := int(binary.BigEndian.Uint16(b[:2]))
	if len(b) < 2+n {
		return "", nil, false
	}
	return string(b[2 : 2+n]), b[2+n:], true
}

func mustJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}
