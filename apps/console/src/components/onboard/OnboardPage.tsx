import React, { useEffect, useState, useMemo } from 'react';
import {
  Download,
  Terminal,
  Copy,
  Check,
  ShieldCheck,
  Cpu,
  Monitor,
  Apple,
  Server,
  Smartphone,
  Sparkles,
  Users,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  ExternalLink
} from 'lucide-react';

type PlatformOS = 'windows' | 'macos' | 'linux' | 'android';
type PlatformArch = 'amd64' | 'arm64' | '386' | 'universal';

interface MachineProfile {
  os: PlatformOS;
  arch: PlatformArch;
  osLabel: string;
  archLabel: string;
  hardwareHint: string;
  recommendedFormat: string;
  filename: string;
  primaryLabel: string;
  altFormat: string;
  altLabel: string;
  oneLiner: string;
  shellName: string;
  steps: string[];
}

const API_HOST =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? `http://${window.location.hostname}:3001`
    : 'https://api.apexmsp.app';

function detectAppleSiliconWebGL(): 'arm64' | 'amd64' | 'universal' {
  try {
    const canvas = document.createElement('canvas');
    const gl =
      (canvas.getContext('webgl') as WebGLRenderingContext | null) ||
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!gl) return 'universal';
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return 'universal';
    const renderer = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '').toLowerCase();
    if (renderer.includes('apple m') || renderer.includes('apple gpu')) {
      return 'arm64';
    }
    if (renderer.includes('intel') || renderer.includes('amd') || renderer.includes('radeon')) {
      return 'amd64';
    }
  } catch {}
  return 'universal';
}

function buildProfile(os: PlatformOS, arch: PlatformArch, hardwareHint?: string): MachineProfile {
  if (os === 'macos') {
    const archLabel =
      arch === 'arm64'
        ? 'Apple Silicon (M1–M5 ARM64) + Universal'
        : arch === 'amd64'
          ? 'Intel x86_64 + Universal'
          : 'Universal (Apple Silicon ARM64 & Intel x86_64)';
    return {
      os: 'macos',
      arch,
      osLabel: 'macOS',
      archLabel,
      hardwareHint: hardwareHint || (arch === 'arm64' ? 'Mac (Apple Silicon)' : arch === 'amd64' ? 'Mac (Intel)' : 'Mac (Universal)'),
      recommendedFormat: 'pkg',
      filename: 'ApexMSP-Agent-Onboard-macOS.pkg',
      primaryLabel: 'Download macOS Package Installer (.pkg)',
      altFormat: 'zip',
      altLabel: 'Download Clickable Terminal Installer (.zip)',
      oneLiner: 'curl -fsSL https://apexmsp.app/onboard | sudo bash',
      shellName: 'macOS Terminal (Fastest — Bypasses Gatekeeper)',
      steps: [
        'Fastest on macOS: Copy & paste the 1-line Terminal command below, OR open the downloaded ApexMSP-Agent-Onboard-macOS.pkg (or .zip -> .command with +x permissions preserved).',
        'Approve the macOS Administrator / Touch ID prompt so the LaunchDaemon, ApexConnect Remote & Shark Fin menu bar install cleanly as root.',
        'This Mac immediately appears in the ApexMSP Onboarding Group ready for admin assignment to a client.'
      ]
    };
  }

  if (os === 'linux') {
    const isArm = arch === 'arm64';
    return {
      os: 'linux',
      arch: isArm ? 'arm64' : 'amd64',
      osLabel: 'Linux',
      archLabel: isArm ? 'ARM64 (aarch64)' : '64-bit (x86_64 / AMD64)',
      hardwareHint: hardwareHint || `Linux (${isArm ? 'ARM64' : 'x86_64'})`,
      recommendedFormat: 'sh',
      filename: `Install-ApexMSP-Onboard-Linux-${isArm ? 'arm64' : 'amd64'}.sh`,
      primaryLabel: `Download Linux ${isArm ? 'ARM64' : 'x64'} Installer (.sh)`,
      altFormat: 'binary',
      altLabel: `Download Linux ${isArm ? 'ARM64' : 'x64'} Binary`,
      oneLiner: 'curl -fsSL https://apexmsp.app/onboard | sudo bash',
      shellName: 'Linux Bash Shell',
      steps: [
        'Run the downloaded .sh script with sudo (or paste the 1-line curl command into your terminal).',
        'The systemd service apexmsp-agent.service starts automatically and enrolls with tok-onboarding.',
        'This Linux host appears in the Onboarding Group ready for admin client assignment.'
      ]
    };
  }

  if (os === 'android') {
    return {
      os: 'android',
      arch: 'arm64',
      osLabel: 'Android Enterprise',
      archLabel: 'ARM64 / Universal APK',
      hardwareHint: hardwareHint || 'Android Tablet / Mobile',
      recommendedFormat: 'apk',
      filename: 'ApexMDM-DPC.apk',
      primaryLabel: 'Download ApexMDM DPC Installer (.apk)',
      altFormat: 'bridge',
      altLabel: 'Download ApexAgent Remote Bridge (.apk)',
      oneLiner: 'adb install -r ApexMDM-DPC.apk',
      shellName: 'ADB / Android Package Installer',
      steps: [
        'Open the downloaded ApexMDM-DPC.apk on the Android device and allow installation.',
        'Complete Device Owner / Kiosk enrollment; the device checks in automatically.',
        'Assign the enrolled Android device from the Onboarding Group to the target client.'
      ]
    };
  }

  // Default: Windows
  const is32 = arch === '386';
  return {
    os: 'windows',
    arch: is32 ? '386' : 'amd64',
    osLabel: 'Windows 10 / 11 / Server',
    archLabel: is32 ? '32-bit (x86)' : '64-bit (x64 / AMD64)',
    hardwareHint: hardwareHint || (is32 ? 'Windows PC (32-bit x86)' : 'Windows PC / Server (64-bit x64)'),
    recommendedFormat: 'exe',
    filename: is32 ? 'ApexMSP-Agent-Onboard-x86.exe' : 'ApexMSP-Agent-Onboard-x64.exe',
    primaryLabel: is32 ? 'Download Windows 32-bit Installer (.exe)' : 'Download Windows 64-bit Installer (.exe)',
    altFormat: 'bat',
    altLabel: 'Download 1-Click Batch Installer (.bat)',
    oneLiner: 'irm https://apexmsp.app/onboard | iex',
    shellName: 'Windows PowerShell (Run as Administrator)',
    steps: [
      `Run ${is32 ? 'ApexMSP-Agent-Onboard-x86.exe' : 'ApexMSP-Agent-Onboard-x64.exe'} and click "Yes" on the Windows UAC prompt (or run the 1-line PowerShell command).`,
      'The installer automatically registers the ApexMSPAgent Windows Service, ApexConnect Remote, and Shark Fin system tray.',
      'This machine is placed directly in the Onboarding Group so an admin can assign it to the proper client.'
    ]
  };
}

export const OnboardPage: React.FC = () => {
  const [detectedOs, setDetectedOs] = useState<PlatformOS>('windows');
  const [detectedArch, setDetectedArch] = useState<PlatformArch>('amd64');
  const [hardwareHint, setHardwareHint] = useState<string>('Detecting machine...');
  const [selectedOverride, setSelectedOverride] = useState<{ os: PlatformOS; arch: PlatformArch } | null>(null);
  const [autoDownloadState, setAutoDownloadState] = useState<'detecting' | 'starting' | 'downloaded' | 'skipped'>('detecting');
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function detectMachine() {
      const params = new URLSearchParams(window.location.search);
      const qOs = (params.get('os') || '').toLowerCase();
      const qArch = (params.get('arch') || '').toLowerCase();
      const skipAuto = params.get('autodownload') === '0' || params.get('preview') === '1';

      const ua = navigator.userAgent || '';
      const uaLower = ua.toLowerCase();
      const platformStr = (navigator.platform || '').toLowerCase();

      let os: PlatformOS = 'windows';
      if (qOs === 'windows' || qOs === 'win') os = 'windows';
      else if (qOs === 'macos' || qOs === 'mac' || qOs === 'darwin') os = 'macos';
      else if (qOs === 'linux') os = 'linux';
      else if (qOs === 'android') os = 'android';
      else if (uaLower.includes('android')) os = 'android';
      else if (uaLower.includes('macintosh') || uaLower.includes('mac os') || platformStr.includes('mac')) os = 'macos';
      else if (uaLower.includes('win') || platformStr.includes('win')) os = 'windows';
      else if (uaLower.includes('linux') || platformStr.includes('linux')) os = 'linux';

      let arch: PlatformArch = 'amd64';
      let hint = '';

      if (qArch === 'arm64' || qArch === 'aarch64') {
        arch = 'arm64';
      } else if (qArch === '386' || qArch === 'x86') {
        arch = '386';
      } else if (qArch === 'amd64' || qArch === 'x64' || qArch === 'x86_64') {
        arch = 'amd64';
      } else {
        // High-entropy Client Hints when supported (Chromium / Edge / Chrome)
        const navAny = navigator as any;
        if (navAny.userAgentData && typeof navAny.userAgentData.getHighEntropyValues === 'function') {
          try {
            const he = await navAny.userAgentData.getHighEntropyValues([
              'architecture',
              'bitness',
              'platform',
              'platformVersion',
              'model'
            ]);
            const heArch = String(he.architecture || '').toLowerCase();
            const heBits = String(he.bitness || '');
            if (heArch.includes('arm')) {
              arch = 'arm64';
            } else if (heBits === '32' || (heArch.includes('x86') && heBits === '32')) {
              arch = '386';
            } else if (heArch.includes('x86')) {
              arch = 'amd64';
            }
            if (he.platform) {
              hint = `${he.platform} (${heArch || arch}${heBits ? ` ${heBits}-bit` : ''})`;
            }
          } catch {}
        }

        if (os === 'macos' && !qArch) {
          const glArch = detectAppleSiliconWebGL();
          if (glArch === 'arm64') {
            arch = 'arm64';
            hint = 'Apple Silicon Mac (M-Series ARM64)';
          } else if (glArch === 'amd64' && arch !== 'arm64') {
            arch = 'amd64';
            hint = 'Intel Mac (x86_64)';
          }
        } else if (os === 'windows' && !qArch) {
          const is32 =
            !uaLower.includes('win64') &&
            !uaLower.includes('x64') &&
            !uaLower.includes('wow64') &&
            (uaLower.includes('win32') || platformStr === 'win32') &&
            arch === '386';
          arch = is32 ? '386' : 'amd64';
          if (!hint) {
            hint = is32 ? 'Windows PC (32-bit x86)' : 'Windows PC / Server (64-bit x64)';
          }
        }
      }

      if (cancelled) return;
      setDetectedOs(os);
      setDetectedArch(arch);
      const profile = buildProfile(os, arch, hint || undefined);
      setHardwareHint(profile.hardwareHint);

      if (skipAuto) {
        setAutoDownloadState('skipped');
        return;
      }

      setAutoDownloadState('starting');
      const timer = window.setTimeout(() => {
        if (cancelled) return;
        triggerDownload(profile.os, profile.arch, profile.recommendedFormat);
        setAutoDownloadState('downloaded');
      }, 900);

      return () => window.clearTimeout(timer);
    }

    detectMachine();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeProfile = useMemo(() => {
    if (selectedOverride) {
      return buildProfile(selectedOverride.os, selectedOverride.arch);
    }
    return buildProfile(detectedOs, detectedArch, hardwareHint);
  }, [selectedOverride, detectedOs, detectedArch, hardwareHint]);

  const getDownloadUrl = (os: PlatformOS, arch: PlatformArch, format: string) => {
    if (os === 'android' && format === 'bridge') {
      return `${API_HOST}/api/v1/mdm/apks/apex-agent.apk`;
    }
    if (os === 'android') {
      return `${API_HOST}/api/v1/apexmdm/dpc/latest.apk`;
    }
    return `${API_HOST}/api/v1/installers/onboard/download?os=${os}&arch=${arch}&format=${format}`;
  };

  const triggerDownload = (os: PlatformOS, arch: PlatformArch, format: string) => {
    const url = getDownloadUrl(os, arch, format);
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopyCommand = () => {
    navigator.clipboard.writeText(activeProfile.oneLiner);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2200);
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText('https://apexmsp.app/onboard');
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2200);
  };

  const PlatformIcon =
    activeProfile.os === 'macos'
      ? Apple
      : activeProfile.os === 'linux'
        ? Server
        : activeProfile.os === 'android'
          ? Smartphone
          : Monitor;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at 50% 0%, #0f172a 0%, #050811 70%)',
        color: '#f8fafc',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif',
        padding: '32px 18px 64px'
      }}
    >
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        {/* Top Brand Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 28
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 24px -4px rgba(14, 165, 233, 0.45)',
                fontWeight: 900,
                fontSize: 20,
                color: '#fff'
              }}
            >
              ▲
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>
                ApexMSP <span style={{ color: '#38bdf8', fontWeight: 600 }}>Zero-Touch Onboarding</span>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                Automatic Machine Detection &bull; Onboarding Group Queue
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={handleCopyUrl}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 13px',
                borderRadius: 10,
                border: '1px solid rgba(56, 189, 248, 0.3)',
                background: 'rgba(15, 23, 42, 0.8)',
                color: '#e2e8f0',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {copiedLink ? <Check size={14} color="#22c55e" /> : <Copy size={14} color="#38bdf8" />}
              {copiedLink ? 'Copied apexmsp.app/onboard' : 'Share: apexmsp.app/onboard'}
            </button>
            <a
              href="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 13px',
                borderRadius: 10,
                border: '1px solid rgba(148, 163, 184, 0.2)',
                background: 'rgba(30, 41, 59, 0.5)',
                color: '#94a3b8',
                fontSize: 12,
                fontWeight: 600,
                textDecoration: 'none'
              }}
            >
              Admin Console <ExternalLink size={13} />
            </a>
          </div>
        </div>

        {/* Hero Auto-Detection & Download Card */}
        <div
          style={{
            background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.92) 0%, rgba(9, 13, 24, 0.96) 100%)',
            border: '1px solid rgba(56, 189, 248, 0.28)',
            borderRadius: 22,
            padding: '28px 28px 24px',
            boxShadow: '0 24px 60px -15px rgba(14, 165, 233, 0.18)',
            marginBottom: 22
          }}
        >
          {/* Status Pill Row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 12px',
                borderRadius: 999,
                background: 'rgba(14, 165, 233, 0.14)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                color: '#38bdf8',
                fontSize: 11.5,
                fontWeight: 700,
                letterSpacing: '0.03em',
                textTransform: 'uppercase'
              }}
            >
              <Sparkles size={13} />
              Detected: {activeProfile.osLabel} &bull; {activeProfile.archLabel}
            </span>

            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 12px',
                borderRadius: 999,
                background: 'rgba(245, 158, 11, 0.14)',
                border: '1px solid rgba(245, 158, 11, 0.38)',
                color: '#fbbf24',
                fontSize: 11.5,
                fontWeight: 700
              }}
            >
              <Users size={13} />
              Destination: Onboarding Group (Admin Assignable)
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
              gap: 24,
              alignItems: 'center'
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                <div
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: 16,
                    background: 'rgba(14, 165, 233, 0.12)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#38bdf8',
                    flexShrink: 0
                  }}
                >
                  <PlatformIcon size={28} />
                </div>
                <div>
                  <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: '#fff', letterSpacing: '-0.02em' }}>
                    {activeProfile.osLabel} Agent
                  </h1>
                  <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Cpu size={14} color="#38bdf8" />
                    <span>{activeProfile.archLabel}</span>
                  </div>
                </div>
              </div>

              <p style={{ fontSize: 13.5, lineHeight: 1.6, color: '#cbd5e1', margin: '0 0 16px' }}>
                This installer is pre-configured with the <strong>Onboarding Group</strong> enrollment token (
                <code style={{ color: '#38bdf8', background: 'rgba(14,165,233,0.12)', padding: '2px 6px', borderRadius: 5 }}>
                  tok-onboarding
                </code>
                ). Once installed, the machine automatically checks into the <strong>Onboarding Group</strong> where an
                administrator can assign it to any Client Organization and Site in one click.
              </p>

              {/* Auto-download feedback banner */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  borderRadius: 12,
                  background:
                    autoDownloadState === 'downloaded'
                      ? 'rgba(34, 197, 94, 0.11)'
                      : 'rgba(14, 165, 233, 0.11)',
                  border:
                    autoDownloadState === 'downloaded'
                      ? '1px solid rgba(34, 197, 94, 0.35)'
                      : '1px solid rgba(56, 189, 248, 0.3)',
                  fontSize: 12.5,
                  color: autoDownloadState === 'downloaded' ? '#86efac' : '#bae6fd'
                }}
              >
                {autoDownloadState === 'downloaded' ? (
                  <>
                    <CheckCircle2 size={16} color="#22c55e" style={{ flexShrink: 0 }} />
                    <span>
                      <strong>Auto-download started:</strong> <code>{activeProfile.filename}</code>. Check your browser
                      downloads bar and open the file to complete enrollment.
                    </span>
                  </>
                ) : (
                  <>
                    <RefreshCw size={16} color="#38bdf8" style={{ flexShrink: 0 }} />
                    <span>
                      Preparing <strong>{activeProfile.filename}</strong> for your machine...
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Primary & Secondary Download Actions */}
            <div
              style={{
                background: 'rgba(2, 6, 23, 0.65)',
                border: '1px solid rgba(148, 163, 184, 0.16)',
                borderRadius: 16,
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 12
              }}
            >
              <button
                onClick={() => triggerDownload(activeProfile.os, activeProfile.arch, activeProfile.recommendedFormat)}
                style={{
                  width: '100%',
                  padding: '14px 18px',
                  borderRadius: 12,
                  border: 'none',
                  background: 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  boxShadow: '0 10px 25px -5px rgba(14, 165, 233, 0.45)'
                }}
              >
                <Download size={18} />
                {activeProfile.primaryLabel}
              </button>

              <button
                onClick={() => triggerDownload(activeProfile.os, activeProfile.arch, activeProfile.altFormat)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  background: 'rgba(30, 41, 59, 0.65)',
                  color: '#e2e8f0',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8
                }}
              >
                <Download size={14} color="#38bdf8" />
                {activeProfile.altLabel}
              </button>

              <div
                style={{
                  borderTop: '1px solid rgba(148, 163, 184, 0.12)',
                  paddingTop: 10,
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 11,
                  color: '#64748b',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'
                }}
              >
                <span>File: {activeProfile.filename}</span>
                <span>Group: Onboarding</span>
              </div>
            </div>
          </div>

          {/* 1-Line Instant CLI Command Box */}
          <div
            style={{
              marginTop: 22,
              background: 'rgba(2, 6, 23, 0.85)',
              border: '1px solid rgba(56, 189, 248, 0.22)',
              borderRadius: 14,
              padding: '14px 16px'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
                fontSize: 11.5,
                color: '#94a3b8',
                fontWeight: 600
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Terminal size={14} color="#38bdf8" />
                Zero-Touch 1-Line Install ({activeProfile.shellName})
              </span>
              <span style={{ color: '#64748b' }}>Auto-enrolls into Onboarding Group</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <code
                style={{
                  flex: 1,
                  background: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid rgba(148, 163, 184, 0.15)',
                  borderRadius: 9,
                  padding: '10px 12px',
                  fontSize: 12.5,
                  color: '#38bdf8',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  overflowX: 'auto',
                  whiteSpace: 'nowrap'
                }}
              >
                {activeProfile.oneLiner}
              </code>
              <button
                onClick={handleCopyCommand}
                style={{
                  padding: '10px 14px',
                  borderRadius: 9,
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  background: copiedCmd ? 'rgba(34, 197, 94, 0.18)' : 'rgba(14, 165, 233, 0.15)',
                  color: copiedCmd ? '#4ade80' : '#38bdf8',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  flexShrink: 0
                }}
              >
                {copiedCmd ? <Check size={14} /> : <Copy size={14} />}
                {copiedCmd ? 'Copied!' : 'Copy Command'}
              </button>
            </div>
          </div>
        </div>

        {/* Platform Override Selector (for downloading to USB / another machine) */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.7)',
            border: '1px solid rgba(148, 163, 184, 0.15)',
            borderRadius: 16,
            padding: '16px 20px',
            marginBottom: 22
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10,
              marginBottom: 12
            }}
          >
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#cbd5e1' }}>
              Need an onboarding installer for a different machine or architecture?
            </div>
            {selectedOverride && (
              <button
                onClick={() => setSelectedOverride(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#38bdf8',
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Reset to auto-detected ({detectedOs} / {detectedArch})
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[
              { label: 'Windows 64-bit (x64)', os: 'windows' as PlatformOS, arch: 'amd64' as PlatformArch },
              { label: 'Windows 32-bit (x86)', os: 'windows' as PlatformOS, arch: '386' as PlatformArch },
              { label: 'macOS Apple Silicon (M1–M5)', os: 'macos' as PlatformOS, arch: 'arm64' as PlatformArch },
              { label: 'macOS Intel (x86_64)', os: 'macos' as PlatformOS, arch: 'amd64' as PlatformArch },
              { label: 'Linux x86_64', os: 'linux' as PlatformOS, arch: 'amd64' as PlatformArch },
              { label: 'Linux ARM64', os: 'linux' as PlatformOS, arch: 'arm64' as PlatformArch },
              { label: 'Android Enterprise APK', os: 'android' as PlatformOS, arch: 'arm64' as PlatformArch }
            ].map((item) => {
              const isSelected = activeProfile.os === item.os && activeProfile.arch === item.arch;
              return (
                <button
                  key={`${item.os}-${item.arch}`}
                  onClick={() => {
                    setSelectedOverride({ os: item.os, arch: item.arch });
                    const p = buildProfile(item.os, item.arch);
                    triggerDownload(p.os, p.arch, p.recommendedFormat);
                  }}
                  style={{
                    padding: '8px 13px',
                    borderRadius: 9,
                    border: isSelected ? '1px solid #38bdf8' : '1px solid rgba(148, 163, 184, 0.2)',
                    background: isSelected ? 'rgba(14, 165, 233, 0.18)' : 'rgba(30, 41, 59, 0.5)',
                    color: isSelected ? '#38bdf8' : '#cbd5e1',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <Download size={12} />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 3-Step Onboarding & Admin Client Assignment Workflow */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.7)',
            border: '1px solid rgba(148, 163, 184, 0.15)',
            borderRadius: 16,
            padding: '20px 22px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <ShieldCheck size={18} color="#22c55e" />
            <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#f1f5f9' }}>
              How Onboarding Group Enrollment Works
            </h2>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
              gap: 14
            }}
          >
            {activeProfile.steps.map((stepText, idx) => (
              <div
                key={idx}
                style={{
                  background: 'rgba(2, 6, 23, 0.55)',
                  border: '1px solid rgba(148, 163, 184, 0.12)',
                  borderRadius: 12,
                  padding: 14
                }}
              >
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11,
                    fontWeight: 800,
                    color: '#38bdf8',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    marginBottom: 6
                  }}
                >
                  <span>Step {idx + 1}</span>
                  {idx < 2 && <ArrowRight size={12} />}
                </div>
                <div style={{ fontSize: 12.5, lineHeight: 1.5, color: '#cbd5e1' }}>{stepText}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardPage;
