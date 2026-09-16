import fs from 'fs';
import path from 'path';

/**
 * Agent release manifest.
 * ---------------------------------------------------------------------------
 * Cutting a release is a file drop, not a redeploy: cross-compile the agent,
 * copy the binaries into AGENT_BUILDS_DIR (default /builds, a docker volume),
 * and write a manifest.json describing the latest version + per-platform file +
 * SHA-256. Agents report their version on every heartbeat; when the manifest is
 * newer for their os/arch, the heartbeat response carries an update directive
 * and the agent self-updates (checksum-verified). See scripts/release-agent.sh.
 *
 * manifest.json shape:
 * {
 *   "version": "1.1.0",
 *   "artifacts": {
 *     "darwin/arm64":  { "file": "apexagent-1.1.0-darwin-arm64",  "sha256": "..." },
 *     "darwin/amd64":  { "file": "apexagent-1.1.0-darwin-amd64",  "sha256": "..." },
 *     "linux/amd64":   { "file": "apexagent-1.1.0-linux-amd64",   "sha256": "..." },
 *     "windows/amd64": { "file": "apexagent-1.1.0-windows-amd64.exe", "sha256": "..." }
 *   }
 * }
 */

export const BUILDS_DIR = process.env.AGENT_BUILDS_DIR || '/builds';

interface Artifact { file: string; sha256: string }
interface Manifest { version: string; artifacts: Record<string, Artifact> }

let cache: { at: number; manifest: Manifest | null } = { at: 0, manifest: null };
const TTL_MS = 15000;

function readManifest(): Manifest | null {
  const now = Date.now();
  if (cache.manifest !== null && now - cache.at < TTL_MS) return cache.manifest;
  try {
    const raw = fs.readFileSync(path.join(BUILDS_DIR, 'manifest.json'), 'utf8');
    const m = JSON.parse(raw) as Manifest;
    cache = { at: now, manifest: m && m.version ? m : null };
  } catch {
    cache = { at: now, manifest: null };
  }
  return cache.manifest;
}

// macos → darwin; others pass through.
function goos(deviceOs: string): string {
  return deviceOs === 'macos' ? 'darwin' : deviceOs;
}

// Compare semver MAJOR.MINOR.PATCH; returns true if a > b.
function greater(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

export interface UpdateDirective { version: string; url: string; sha256: string }

/**
 * Returns an update directive if a newer build exists for this agent's os/arch,
 * else null. `publicBase` is the browser/agent-facing origin the download URL is
 * built from (e.g. https://api.apexmsp.app).
 */
export function updateDirectiveFor(
  deviceOs: string,
  arch: string,
  agentVersion: string,
  publicBase: string
): UpdateDirective | null {
  const m = readManifest();
  if (!m) return null;
  if (!agentVersion || !greater(m.version, agentVersion)) return null;
  const os = goos(deviceOs);
  const key = `${os}/${arch}`;
  const art = m.artifacts[key];
  if (!art) return null;
  const base = (publicBase || '').replace(/\/+$/, '');
  return {
    version: m.version,
    url: `${base}/api/v1/agents/download/${os}/${arch}`,
    sha256: art.sha256
  };
}

/** Resolve the on-disk artifact path for an os/arch, or null. */
export function artifactPath(os: string, arch: string): { path: string; file: string } | null {
  const m = readManifest();
  if (!m) return null;
  const art = m.artifacts[`${os}/${arch}`];
  if (!art || !art.file) return null;
  // Guard against path traversal — file is a bare name within BUILDS_DIR.
  const safe = path.basename(art.file);
  const full = path.join(BUILDS_DIR, safe);
  if (!fs.existsSync(full)) return null;
  return { path: full, file: safe };
}

export function latestVersion(): string | null {
  return readManifest()?.version ?? null;
}
