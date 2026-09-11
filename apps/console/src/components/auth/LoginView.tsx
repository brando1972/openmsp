import React, { useState } from 'react';
import { Lock, Mail, ShieldAlert, ArrowRight, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { useApp } from '../../data/AppContext';

export const LoginView: React.FC = () => {
  const { login } = useApp();
  const [email, setEmail] = useState('admin@openmsp.local');
  const [password, setPassword] = useState('Admin123!');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMessage('Please enter both email and password.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      await login(email, password);
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('fetch') || msg.includes('Failed')) {
        setErrorMessage('Unable to reach backend API. Use the pre-filled demo credentials below to sign in directly.');
      } else {
        setErrorMessage(msg || 'Authentication failed. Please check your credentials.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fillDemoCredentials = () => {
    setEmail('admin@openmsp.local');
    setPassword('Admin123!');
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen w-screen bg-slate-950 flex flex-col justify-center items-center p-4 selection:bg-sky-500/30 selection:text-sky-200">
      {/* Background glow effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-500 to-emerald-500 shadow-xl shadow-sky-500/20 mb-4 ring-1 ring-white/20">
            <span className="text-white font-black text-2xl tracking-wider">Ω</span>
          </div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">OpenMSP Control Plane</h1>
          <p className="text-sm text-slate-400 mt-1 font-medium">Enterprise Unified PSA, RMM & Remote Support</p>
        </div>

        {/* Card */}
        <div className="bg-slate-900/90 border border-slate-800 backdrop-blur-xl rounded-2xl p-7 shadow-2xl shadow-black/40">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-slate-100">Sign in to console</h2>
            <p className="text-xs text-slate-400 mt-1">Authenticate with your MSP technician credentials.</p>
          </div>

          {errorMessage && (
            <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{errorMessage}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Email Address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@openmsp.local"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950/70 border border-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded-xl text-sm text-slate-100 placeholder:text-slate-600 outline-none transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-950/70 border border-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded-xl text-sm text-slate-100 placeholder:text-slate-600 outline-none transition font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 transition"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Pre-fill Demo Hint */}
            <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-sky-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" />
                <span>Demo: <strong className="font-mono text-sky-200">admin@openmsp.local</strong></span>
              </div>
              <button
                type="button"
                onClick={fillDemoCredentials}
                className="text-[11px] font-bold text-sky-400 hover:text-sky-300 underline underline-offset-2"
              >
                Reset demo
              </button>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 active:scale-[0.99] disabled:opacity-50 text-white font-semibold text-sm transition shadow-lg shadow-sky-950/40 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-xs text-slate-500">
          OpenMSP v1.0 &bull; Multi-Tenant Control Plane
        </div>
      </div>
    </div>
  );
};

export default LoginView;
