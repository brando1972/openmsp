import React, { useState } from 'react';
import { Shield, Lock, Mail, AlertCircle, Loader2, Sparkles, CheckCircle2 } from 'lucide-react';
import { useApp } from '../../data/AppContext';
import { api } from '../../services/api';

export const LoginView: React.FC = () => {
  const { login, whiteLabel } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sendingMagicLink, setSendingMagicLink] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMagicLinkSent(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err: any) {
      setError(err.message || 'Invalid credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMagicLink = async () => {
    const targetEmail = email.trim();
    if (!targetEmail) {
      setError('Enter your operator email address first to receive a sign-in link.');
      return;
    }
    setError(null);
    setMagicLinkSent(null);
    setSendingMagicLink(true);
    try {
      const res = await api.auth.requestMagicLink(targetEmail);
      setMagicLinkSent(res.message);
    } catch (err: any) {
      setError(err.message || 'Unable to send magic link.');
    } finally {
      setSendingMagicLink(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background visual accents */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl p-8 relative z-10">
        <div className="flex flex-col items-center text-center mb-7">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg mb-4 border border-blue-400/30"
            style={{ backgroundColor: whiteLabel.primaryColor || '#2563eb' }}
          >
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {whiteLabel.companyName || 'ApexMSP'} Control Plane
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Zero-Trust RMM, SOC, &amp; Immutable Backup Operations
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5 text-red-300 text-sm">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {magicLinkSent && (
          <div className="mb-5 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-2.5 text-emerald-300 text-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{magicLinkSent}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Operator Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-950/90 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Master Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-slate-950/90 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || sendingMagicLink}
            className="w-full py-2.5 px-4 rounded-xl font-semibold text-sm text-white shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            style={{ backgroundColor: whiteLabel.primaryColor || '#2563eb' }}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Signing In...
              </>
            ) : (
              'Sign In to Control Plane'
            )}
          </button>
        </form>

        <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-col gap-2.5">
          <button
            type="button"
            disabled={loading || sendingMagicLink}
            onClick={handleSendMagicLink}
            className="w-full py-2 px-3 rounded-xl font-medium text-xs text-slate-300 bg-slate-800/70 hover:bg-slate-800 border border-slate-700/70 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {sendingMagicLink ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                Sending Magic Link...
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                Send Magic Link
              </>
            )}
          </button>
          <p className="text-[11px] text-center text-slate-500">
            Authorized personnel only. Unauthorized access is logged.
          </p>
        </div>
      </div>
    </div>
  );
};
