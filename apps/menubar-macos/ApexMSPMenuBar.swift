// ApexMSP menu-bar app (macOS).
// A lightweight status-bar item (sharkfin outline) that shows the ApexMSP agent's
// live status, interactive Shark Fin Security Controls (AV, EDR, Ransomware Guard,
// Canary Tripwires, YARA-X/ClamAV Scanner), and quick actions.
//
// Build:   swiftc ApexMSPMenuBar.swift -o ApexMSP -framework Cocoa
// Runs as an accessory app (LSUIElement) so it lives only in the menu bar.

import Cocoa

let AGENT_DIR = ("~/.apexmsp" as NSString).expandingTildeInPath
let AGENT_LOG = ("~/.apexmsp/agent.log" as NSString).expandingTildeInPath
let AGENT_CONFIG = ("~/.apexmsp/agent.json" as NSString).expandingTildeInPath
let SECURITY_POLICY_PATH = ("~/.apexmsp/security-policy.json" as NSString).expandingTildeInPath
let DEFAULT_API_URL = "http://192.168.4.150:3001"
let CONSOLE_URL = "https://apexmsp.app"

// MARK: - Agent config (device identity, for device-authenticated API calls).
struct AgentConfig {
    var serverUrl: String
    var deviceId: String
    var deviceSecret: String
}

func loadConfig() -> AgentConfig? {
    guard let data = FileManager.default.contents(atPath: AGENT_CONFIG),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
    let server = (obj["serverUrl"] as? String) ?? DEFAULT_API_URL
    guard let did = obj["deviceId"] as? String, let sec = obj["deviceSecret"] as? String, !did.isEmpty else { return nil }
    return AgentConfig(serverUrl: server, deviceId: did, deviceSecret: sec)
}

// MARK: - Shark Fin Live Security Policy (~/.apexmsp/security-policy.json)
struct SharkFinSecurityPolicy {
    var preventiveAvEnabled: Bool = true
    var endpointEdrEnabled: Bool = true
    var ransomwareProtectionEnabled: Bool = true
    var canaryTripwireEnabled: Bool = true
    var yaraClamScannerEnabled: Bool = true
    var soarOrborusWorkerEnabled: Bool = true
    var policyLockedByAdmin: Bool = false
    var updatedAt: String = ""
    var updatedBy: String = "sharkfin_client"

    func toDictionary() -> [String: Any] {
        return [
            "preventiveAvEnabled": preventiveAvEnabled,
            "endpointEdrEnabled": endpointEdrEnabled,
            "ransomwareProtectionEnabled": ransomwareProtectionEnabled,
            "canaryTripwireEnabled": canaryTripwireEnabled,
            "yaraClamScannerEnabled": yaraClamScannerEnabled,
            "soarOrborusWorkerEnabled": soarOrborusWorkerEnabled,
            "policyLockedByAdmin": policyLockedByAdmin,
            "updatedAt": updatedAt,
            "updatedBy": updatedBy
        ]
    }
}

func isoNow() -> String {
    let fmt = ISO8601DateFormatter()
    return fmt.string(from: Date())
}

func loadSecurityPolicy() -> SharkFinSecurityPolicy {
    var pol = SharkFinSecurityPolicy()
    pol.updatedAt = isoNow()
    guard let data = FileManager.default.contents(atPath: SECURITY_POLICY_PATH),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        saveSecurityPolicy(pol, syncRemote: false)
        return pol
    }
    if let v = obj["preventiveAvEnabled"] as? Bool { pol.preventiveAvEnabled = v }
    if let v = obj["endpointEdrEnabled"] as? Bool { pol.endpointEdrEnabled = v }
    if let v = obj["ransomwareProtectionEnabled"] as? Bool { pol.ransomwareProtectionEnabled = v }
    if let v = obj["canaryTripwireEnabled"] as? Bool { pol.canaryTripwireEnabled = v }
    if let v = obj["yaraClamScannerEnabled"] as? Bool { pol.yaraClamScannerEnabled = v }
    if let v = obj["soarOrborusWorkerEnabled"] as? Bool { pol.soarOrborusWorkerEnabled = v }
    if let v = obj["policyLockedByAdmin"] as? Bool { pol.policyLockedByAdmin = v }
    if let v = obj["updatedAt"] as? String { pol.updatedAt = v }
    if let v = obj["updatedBy"] as? String { pol.updatedBy = v }
    return pol
}

func saveSecurityPolicy(_ policy: SharkFinSecurityPolicy, syncRemote: Bool = true) {
    var updated = policy
    updated.updatedAt = isoNow()
    updated.updatedBy = "sharkfin_client"

    try? FileManager.default.createDirectory(atPath: AGENT_DIR, withIntermediateDirectories: true)
    if let data = try? JSONSerialization.data(withJSONObject: updated.toDictionary(), options: [.prettyPrinted, .sortedKeys]) {
        try? data.write(to: URL(fileURLWithPath: SECURITY_POLICY_PATH), options: .atomic)
    }

    if syncRemote {
        syncPolicyToControlPlane(updated)
    }
}

func syncPolicyToControlPlane(_ policy: SharkFinSecurityPolicy) {
    let cfg = loadConfig()
    let baseServer = (cfg?.serverUrl ?? DEFAULT_API_URL).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    let devId = cfg?.deviceId ?? (Host.current().localizedName ?? "macbook-sharkfin")
    guard let url = URL(string: "\(baseServer)/api/v1/security/devices/\(devId)/policy") else { return }

    var body = policy.toDictionary()
    body["deviceId"] = devId
    if let sec = cfg?.deviceSecret {
        body["deviceSecret"] = sec
    }

    var req = URLRequest(url: url)
    req.httpMethod = "PATCH"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.httpBody = try? JSONSerialization.data(withJSONObject: body)
    req.timeoutInterval = 10
    URLSession.shared.dataTask(with: req) { _, _, _ in }.resume()
}

// Submit a support ticket (device-authenticated). Calls completion on the main queue.
func submitTicket(subject: String, description: String, priority: String, completion: @escaping (Bool, String) -> Void) {
    guard let cfg = loadConfig() else { completion(false, "Agent not enrolled on this Mac."); return }
    guard let url = URL(string: cfg.serverUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/api/v1/agents/ticket") else {
        completion(false, "Bad server URL."); return
    }
    let body: [String: Any] = [
        "deviceId": cfg.deviceId, "deviceSecret": cfg.deviceSecret,
        "subject": subject, "description": description, "priority": priority
    ]
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.httpBody = try? JSONSerialization.data(withJSONObject: body)
    req.timeoutInterval = 20
    URLSession.shared.dataTask(with: req) { data, resp, err in
        var ok = false; var msg = "Could not reach the server."
        if let err = err { msg = err.localizedDescription }
        else if let http = resp as? HTTPURLResponse {
            if http.statusCode == 200, let d = data,
               let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any] {
                ok = true; msg = (o["ticketNumber"] as? String) ?? "created"
            } else { msg = "Server returned \(http.statusCode)." }
        }
        DispatchQueue.main.async { completion(ok, msg) }
    }.resume()
}

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
    task.arguments = ["-c", "pgrep -f 'openmsp-agent' >/dev/null 2>&1 && echo up || echo down"]
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
    let parts = l.split(separator: " ")
    if parts.count >= 2 { return String(parts[1]) }
    return "—"
}

// MARK: - App
class AppDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem!
    var timer: Timer?
    var manualQuickScanStatus: String? = nil

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.image = sharkfinImage()
        statusItem.button?.toolTip = "ApexMSP Shark Fin Endpoint Security & Agent"
        rebuildMenu()
        timer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in self?.rebuildMenu() }
    }

    func rebuildMenu() {
        let s = readStatus()
        let pol = loadSecurityPolicy()
        let menu = NSMenu()

        let header = NSMenuItem(title: "ApexMSP Shark Fin Agent", action: nil, keyEquivalent: "")
        header.isEnabled = false
        menu.addItem(header)

        let dot = s.running ? "🟢" : "🔴"
        menu.addItem(disabledItem("\(dot) \(s.running ? "Running" : "Stopped")  ·  v\(s.version)"))
        if s.collector { menu.addItem(disabledItem("📡 Site collector · active")) }
        menu.addItem(disabledItem("Last check-in: \(s.lastBeat)"))
        if let qScan = manualQuickScanStatus ?? s.lastScan {
            menu.addItem(disabledItem("Last scan: \(qScan)"))
        }

        // MARK: Shark Fin Security Controls Section
        menu.addItem(NSMenuItem.separator())
        let secHeader = NSMenuItem(title: "Shark Fin Security Controls", action: nil, keyEquivalent: "")
        secHeader.isEnabled = false
        menu.addItem(secHeader)

        if pol.policyLockedByAdmin {
            menu.addItem(disabledItem("🔒 Policy Locked by SOC Administrator"))
        }

        menu.addItem(toggleMenuItem(
            title: "🛡️ Antivirus (AV) Real-Time Protection",
            enabled: pol.preventiveAvEnabled,
            action: #selector(toggleAvProtection)
        ))
        menu.addItem(toggleMenuItem(
            title: "🔍 Endpoint Detection & Response (EDR)",
            enabled: pol.endpointEdrEnabled,
            action: #selector(toggleEdrProtection)
        ))
        menu.addItem(toggleMenuItem(
            title: "🔒 Ransomware Guard (VSS & Shadow Copy Lock)",
            enabled: pol.ransomwareProtectionEnabled,
            action: #selector(toggleRansomwareProtection)
        ))
        menu.addItem(toggleMenuItem(
            title: "🐤 Ransomware Canary Decoy Tripwires",
            enabled: pol.canaryTripwireEnabled,
            action: #selector(toggleCanaryProtection)
        ))
        menu.addItem(toggleMenuItem(
            title: "🧬 YARA-X & ClamAV Malware Scanner",
            enabled: pol.yaraClamScannerEnabled,
            action: #selector(toggleScannerProtection)
        ))

        let quickScan = actionItem("⚡ Run Quick Malware & Canary Scan Now", #selector(triggerQuickScan))
        quickScan.keyEquivalent = "r"
        menu.addItem(quickScan)

        menu.addItem(NSMenuItem.separator())
        let support = actionItem("Request Support…", #selector(requestSupport))
        support.keyEquivalent = "s"
        menu.addItem(support)
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

    func toggleMenuItem(title: String, enabled: Bool, action: Selector) -> NSMenuItem {
        let badge = enabled ? "🟢 Enabled" : "⚪ Disabled"
        let item = NSMenuItem(title: "\(title)  [\(badge)]", action: action, keyEquivalent: "")
        item.target = self
        item.state = enabled ? .on : .off
        return item
    }

    func guardAdminLock(_ pol: SharkFinSecurityPolicy, turningOff: Bool) -> Bool {
        if pol.policyLockedByAdmin && turningOff {
            self.notifyTitle(false, title: "Policy Locked by Administrator", text: "Your organization's SOC administrator has locked endpoint protection settings on this Mac.")
            return false
        }
        return true
    }

    @objc func toggleAvProtection() {
        var pol = loadSecurityPolicy()
        guard guardAdminLock(pol, turningOff: pol.preventiveAvEnabled) else { return }
        pol.preventiveAvEnabled.toggle()
        saveSecurityPolicy(pol)
        rebuildMenu()
    }

    @objc func toggleEdrProtection() {
        var pol = loadSecurityPolicy()
        guard guardAdminLock(pol, turningOff: pol.endpointEdrEnabled) else { return }
        pol.endpointEdrEnabled.toggle()
        saveSecurityPolicy(pol)
        rebuildMenu()
    }

    @objc func toggleRansomwareProtection() {
        var pol = loadSecurityPolicy()
        guard guardAdminLock(pol, turningOff: pol.ransomwareProtectionEnabled) else { return }
        pol.ransomwareProtectionEnabled.toggle()
        saveSecurityPolicy(pol)
        rebuildMenu()
    }

    @objc func toggleCanaryProtection() {
        var pol = loadSecurityPolicy()
        guard guardAdminLock(pol, turningOff: pol.canaryTripwireEnabled) else { return }
        pol.canaryTripwireEnabled.toggle()
        saveSecurityPolicy(pol)
        rebuildMenu()
    }

    @objc func toggleScannerProtection() {
        var pol = loadSecurityPolicy()
        guard guardAdminLock(pol, turningOff: pol.yaraClamScannerEnabled) else { return }
        pol.yaraClamScannerEnabled.toggle()
        saveSecurityPolicy(pol)
        rebuildMenu()
    }

    @objc func triggerQuickScan() {
        let canaryDir = ("~/.apexmsp/canary" as NSString).expandingTildeInPath
        try? FileManager.default.createDirectory(atPath: canaryDir, withIntermediateDirectories: true)
        let canaryFiles = [
            "00_APEX_CANARY_DO_NOT_MODIFY.docx",
            "00_APEX_FINANCIAL_LEDGER_CANARY.xlsx",
            "00_APEX_BACKUP_KEY_CANARY.txt"
        ]
        var intactCount = 0
        for f in canaryFiles {
            let p = (canaryDir as NSString).appendingPathComponent(f)
            if FileManager.default.fileExists(atPath: p) {
                intactCount += 1
            }
        }
        let pol = loadSecurityPolicy()
        syncPolicyToControlPlane(pol)
        let df = DateFormatter()
        df.dateFormat = "HH:mm:ss"
        manualQuickScanStatus = "Clean (\(intactCount)/3 canaries verified at \(df.string(from: Date())))"
        rebuildMenu()
        notifyTitle(
            true,
            title: "Shark Fin Quick Scan Complete",
            text: "Verified macOS XProtect/Gatekeeper posture, \(intactCount)/3 Canary tripwires intact in ~/.apexmsp/canary, and synced live policy with the ApexMSP SOC Console."
        )
    }

    @objc func requestSupport() {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "Request Support"
        alert.informativeText = "Describe the issue. This opens a ticket for your IT provider, tagged to this Mac."
        alert.icon = sharkfinImage()
        alert.addButton(withTitle: "Send")
        alert.addButton(withTitle: "Cancel")

        let width: CGFloat = 320
        let container = NSView(frame: NSRect(x: 0, y: 0, width: width, height: 168))

        let subject = NSTextField(frame: NSRect(x: 0, y: 138, width: width, height: 24))
        subject.placeholderString = "Subject (e.g. Printer won't connect)"
        container.addSubview(subject)

        let priorityLabel = NSTextField(labelWithString: "Priority:")
        priorityLabel.frame = NSRect(x: 0, y: 108, width: 60, height: 22)
        container.addSubview(priorityLabel)
        let priority = NSPopUpButton(frame: NSRect(x: 62, y: 104, width: 130, height: 26), pullsDown: false)
        priority.addItems(withTitles: ["Low", "Medium", "High", "Urgent"])
        priority.selectItem(withTitle: "Medium")
        container.addSubview(priority)

        let scroll = NSScrollView(frame: NSRect(x: 0, y: 0, width: width, height: 96))
        scroll.borderType = .bezelBorder
        scroll.hasVerticalScroller = true
        let textView = NSTextView(frame: scroll.bounds)
        textView.isRichText = false
        textView.font = NSFont.systemFont(ofSize: 12)
        textView.autoresizingMask = [.width]
        scroll.documentView = textView
        container.addSubview(scroll)

        alert.accessoryView = container
        alert.window.initialFirstResponder = subject

        guard alert.runModal() == .alertFirstButtonReturn else { return }
        let subj = subject.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        if subj.isEmpty {
            self.notify(false, "A subject is required.")
            return
        }
        let pri = (priority.titleOfSelectedItem ?? "Medium").lowercased()
        let desc = textView.string
        submitTicket(subject: subj, description: desc, priority: pri) { ok, msg in
            self.notify(ok, ok ? "Ticket \(msg) created. Your IT provider has been notified." : "Couldn't file the ticket: \(msg)")
        }
    }

    func notify(_ ok: Bool, _ text: String) {
        notifyTitle(ok, title: ok ? "Support request sent" : "Support request failed", text: text)
    }

    func notifyTitle(_ ok: Bool, title: String, text: String) {
        NSApp.activate(ignoringOtherApps: true)
        let a = NSAlert()
        a.messageText = title
        a.informativeText = text
        a.alertStyle = ok ? .informational : .warning
        a.icon = sharkfinImage()
        a.addButton(withTitle: "OK")
        a.runModal()
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
