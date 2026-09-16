// ApexMSP menu-bar app (macOS).
// A lightweight status-bar item (sharkfin outline) that shows the ApexMSP agent's
// live status and offers quick actions. It is intentionally decoupled from the
// headless Go agent — it reads the agent's log/state, it does not embed it.
//
// Build:   swiftc ApexMSPMenuBar.swift -o ApexMSP -framework Cocoa
// Runs as an accessory app (LSUIElement) so it lives only in the menu bar.

import Cocoa

let AGENT_LOG = ("~/.apexmsp/agent.log" as NSString).expandingTildeInPath
let CONSOLE_URL = "https://apexmsp.app"

// MARK: - Sharkfin template image (monochrome outline; the menu bar tints it).
func sharkfinImage() -> NSImage {
    let size = NSSize(width: 18, height: 18)
    let img = NSImage(size: size)
    img.lockFocus()
    let p = NSBezierPath()
    // Dorsal fin: convex leading edge up to a hooked apex, concave trailing edge.
    p.move(to: NSPoint(x: 3.0, y: 4.5))
    p.curve(to: NSPoint(x: 12.6, y: 15.2),
            controlPoint1: NSPoint(x: 4.6, y: 9.5),
            controlPoint2: NSPoint(x: 8.6, y: 14.6))
    p.curve(to: NSPoint(x: 14.8, y: 4.5),
            controlPoint1: NSPoint(x: 14.4, y: 11.0),
            controlPoint2: NSPoint(x: 14.6, y: 7.0))
    p.close() // base line back to start
    p.lineWidth = 1.6
    p.lineJoinStyle = .round
    NSColor.black.setStroke()
    p.stroke()
    // A small waterline tick under the fin for character.
    let w = NSBezierPath()
    w.move(to: NSPoint(x: 2.0, y: 2.6))
    w.line(to: NSPoint(x: 16.0, y: 2.6))
    w.lineWidth = 1.4
    w.lineCapStyle = .round
    NSColor.black.setStroke()
    w.stroke()
    img.unlockFocus()
    img.isTemplate = true // adapt to light/dark menu bar
    return img
}

// MARK: - Agent status parsed from the log.
struct AgentStatus {
    var running = false
    var version = "—"
    var collector = false
    var lastBeat = "never"
    var lastScan: String? = nil
}

func readStatus() -> AgentStatus {
    var s = AgentStatus()
    // Process alive?
    let task = Process()
    task.launchPath = "/bin/sh"
    task.arguments = ["-c", "pgrep -f '.apexmsp/openmsp-agent' >/dev/null 2>&1 && echo up || echo down"]
    let pipe = Pipe(); task.standardOutput = pipe
    try? task.run(); task.waitUntilExit()
    let out = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
    s.running = out.contains("up")

    guard let text = try? String(contentsOfFile: AGENT_LOG, encoding: .utf8) else { return s }
    let lines = text.split(separator: "\n").suffix(200)
    for line in lines {
        let l = String(line)
        if let r = l.range(of: "starting (v") {
            let rest = l[r.upperBound...]
            if let end = rest.firstIndex(of: ")") { s.version = String(rest[..<end]) }
        }
        if l.contains("[collector] elected as site collector") { s.collector = true }
        if l.contains("[collector] role released") { s.collector = false }
        if l.contains("Heartbeat acknowledged") {
            s.lastBeat = timePrefix(l)
        }
        if l.contains("scan done:") {
            if let r = l.range(of: "scan done:") { s.lastScan = String(l[r.upperBound...]).trimmingCharacters(in: .whitespaces) }
        }
    }
    return s
}

func timePrefix(_ l: String) -> String {
    // log lines start with "2026/09/15 23:30:07 ..."
    let parts = l.split(separator: " ")
    if parts.count >= 2 { return String(parts[1]) }
    return "—"
}

// MARK: - App
class AppDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem!
    var timer: Timer?

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.image = sharkfinImage()
        statusItem.button?.toolTip = "ApexMSP Agent"
        rebuildMenu()
        timer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in self?.rebuildMenu() }
    }

    func rebuildMenu() {
        let s = readStatus()
        let menu = NSMenu()

        let header = NSMenuItem(title: "ApexMSP Agent", action: nil, keyEquivalent: "")
        header.isEnabled = false
        menu.addItem(header)

        let dot = s.running ? "🟢" : "🔴"
        menu.addItem(disabledItem("\(dot) \(s.running ? "Running" : "Stopped")  ·  v\(s.version)"))
        if s.collector { menu.addItem(disabledItem("📡 Site collector · active")) }
        menu.addItem(disabledItem("Last check-in: \(s.lastBeat)"))
        if let scan = s.lastScan { menu.addItem(disabledItem("Last scan: \(scan)")) }

        menu.addItem(NSMenuItem.separator())
        menu.addItem(actionItem("Open ApexMSP Console", #selector(openConsole)))
        menu.addItem(actionItem("Network Map", #selector(openNetwork)))
        menu.addItem(actionItem("View Agent Log", #selector(openLog)))
        menu.addItem(NSMenuItem.separator())
        menu.addItem(actionItem("Quit ApexMSP Menu", #selector(quit)))

        statusItem.menu = menu
    }

    func disabledItem(_ title: String) -> NSMenuItem {
        let i = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        i.isEnabled = false
        return i
    }
    func actionItem(_ title: String, _ sel: Selector) -> NSMenuItem {
        let i = NSMenuItem(title: title, action: sel, keyEquivalent: "")
        i.target = self
        return i
    }

    @objc func openConsole() { NSWorkspace.shared.open(URL(string: CONSOLE_URL)!) }
    @objc func openNetwork() { NSWorkspace.shared.open(URL(string: CONSOLE_URL)!) }
    @objc func openLog() { NSWorkspace.shared.open(URL(fileURLWithPath: AGENT_LOG)) }
    @objc func quit() { NSApp.terminate(nil) }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate = AppDelegate()
app.delegate = delegate
app.run()
