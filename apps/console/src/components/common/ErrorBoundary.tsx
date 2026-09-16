import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface State { hasError: boolean; message: string }

// Errors that mean "this tab is running an old build whose assets were just
// replaced by a deploy" — recover by reloading once to pull the fresh assets,
// instead of white-screening.
const STALE_BUILD_RE = /ChunkLoadError|Loading chunk|dynamically imported module|module script failed|Unexpected token '<'/i;
const RELOAD_GUARD = 'apex-stale-reload-at';

function reloadedRecently(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD) || 0);
    return Date.now() - last < 15000; // don't loop-reload faster than every 15s
  } catch { return false; }
}
function markReload(): void {
  try { sessionStorage.setItem(RELOAD_GUARD, String(Date.now())); } catch { /* ignore */ }
}

/**
 * App-wide error boundary. Any render error below it shows a recoverable screen
 * (with a Reload button) rather than a blank page, and a stale-build error
 * auto-reloads once so a fresh deploy never leaves the operator stranded.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err?.message || 'Unexpected error' };
  }

  componentDidCatch(err: Error) {
    if (STALE_BUILD_RE.test(err?.message || '') && !reloadedRecently()) {
      markReload();
      window.location.reload();
      return;
    }
    // eslint-disable-next-line no-console
    console.error('[ApexMSP] Render error:', err);
  }

  private reload = () => { markReload(); window.location.reload(); };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen w-screen flex items-center justify-center bg-[#f4f6f8] p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-amber-500" />
          </div>
          <div>
            <div className="text-lg font-bold text-slate-800">Something went wrong</div>
            <div className="text-sm text-slate-500 mt-1">
              This view hit an unexpected error. Reloading usually fixes it — your data is safe.
            </div>
          </div>
          <button
            onClick={this.reload}
            className="mt-1 h-10 px-5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2 text-sm font-semibold"
          >
            <RefreshCw className="w-4 h-4" /> Reload
          </button>
        </div>
      </div>
    );
  }
}
