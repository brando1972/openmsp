import React, { useEffect } from 'react';
import { X, Loader2, AlertTriangle, type LucideIcon } from 'lucide-react';
import { STATUS_STYLE, statusLabel } from './format';

/** Shared UI primitives for Client Management & Billing so every screen looks the same. */

export const btn = {
  primary:
    'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#090113] hover:bg-slate-800 text-white font-semibold text-xs transition shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
  secondary:
    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs border border-slate-200 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
  success:
    'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
  danger:
    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-rose-50 text-rose-600 font-medium text-xs border border-rose-200 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
  ghost:
    'inline-flex items-center gap-1 px-2 py-1 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 text-xs transition cursor-pointer'
};

export const input =
  'w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 disabled:bg-slate-50';

export const PageHeader: React.FC<{
  Icon: LucideIcon;
  tint: string;
  title: string;
  count?: number;
  subtitle?: string;
  onBack?: () => void;
  children?: React.ReactNode;
}> = ({ Icon, tint, title, count, subtitle, onBack, children }) => (
  <div className="min-h-14 bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2 sm:gap-4 shrink-0 shadow-sm">
    <div className="flex items-center gap-2 min-w-0">
      {onBack && (
        <button onClick={onBack} className={btn.ghost} title="Back">
          ←
        </button>
      )}
      <div className="w-8 h-8 rounded border border-slate-200 flex items-center justify-center bg-slate-50 shrink-0">
        <Icon className="w-4 h-4" style={{ color: tint }} />
      </div>
      <div className="min-w-0">
        <h1 className="text-base sm:text-lg font-bold text-[#212b36] tracking-tight truncate">
          {title}
          {typeof count === 'number' && <span className="text-xs text-slate-500 font-medium ml-1.5">({count})</span>}
        </h1>
        {subtitle && <div className="text-[11px] text-slate-500 truncate">{subtitle}</div>}
      </div>
    </div>
    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">{children}</div>
  </div>
);

export const StatusBadge: React.FC<{ status: string; className?: string }> = ({ status, className = '' }) => (
  <span
    className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold whitespace-nowrap ${
      STATUS_STYLE[status] || 'bg-slate-100 text-slate-600 border-slate-200'
    } ${className}`}
  >
    {statusLabel(status)}
  </span>
);

export const Modal: React.FC<{
  title: string;
  onClose: () => void;
  width?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ title, onClose, width = 'max-w-lg', children, footer }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[80] bg-slate-900/40 backdrop-blur-[2px] flex items-start sm:items-center justify-center p-2 sm:p-6 overflow-y-auto" onMouseDown={onClose}>
      <div
        className={`w-full ${width} bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh]`}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800">{title}</h2>
          <button onClick={onClose} className={btn.ghost} aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto custom-scrollbar">{children}</div>
        {footer && <div className="px-4 py-3 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/60 rounded-b-xl">{footer}</div>}
      </div>
    </div>
  );
};

export const Field: React.FC<{ label: string; hint?: string; className?: string; children: React.ReactNode }> = ({
  label,
  hint,
  className = '',
  children
}) => (
  <label className={`block ${className}`}>
    <span className="block text-[11px] font-semibold text-slate-600 mb-1">{label}</span>
    {children}
    {hint && <span className="block text-[10px] text-slate-400 mt-0.5">{hint}</span>}
  </label>
);

export const Stat: React.FC<{ label: string; value: React.ReactNode; tone?: 'default' | 'good' | 'warn' | 'bad'; sub?: React.ReactNode; onClick?: () => void }> = ({
  label,
  value,
  tone = 'default',
  sub,
  onClick
}) => {
  const color = { default: 'text-slate-900', good: 'text-emerald-600', warn: 'text-amber-600', bad: 'text-rose-600' }[tone];
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      onClick={onClick}
      className={`text-left bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-sm ${onClick ? 'hover:border-violet-300 hover:shadow cursor-pointer transition' : ''}`}
    >
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`text-lg font-bold tabular-nums mt-0.5 ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </Comp>
  );
};

export const Card: React.FC<{ title?: React.ReactNode; actions?: React.ReactNode; className?: string; children: React.ReactNode; padded?: boolean }> = ({
  title,
  actions,
  className = '',
  children,
  padded = true
}) => (
  <div className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}>
    {(title || actions) && (
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
        <div className="text-xs font-bold text-slate-700">{title}</div>
        <div className="flex items-center gap-1.5">{actions}</div>
      </div>
    )}
    <div className={padded ? 'p-4' : ''}>{children}</div>
  </div>
);

export const EmptyState: React.FC<{ Icon: LucideIcon; title: string; body?: string; action?: React.ReactNode }> = ({ Icon, title, body, action }) => (
  <div className="flex flex-col items-center justify-center text-center py-14 px-6">
    <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
      <Icon className="w-5 h-5 text-slate-400" />
    </div>
    <div className="text-sm font-semibold text-slate-700">{title}</div>
    {body && <div className="text-xs text-slate-500 mt-1 max-w-sm">{body}</div>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const Loading: React.FC<{ label?: string }> = ({ label = 'Loading…' }) => (
  <div className="flex items-center justify-center gap-2 py-14 text-xs text-slate-500">
    <Loader2 className="w-4 h-4 animate-spin" /> {label}
  </div>
);

export const ErrorBanner: React.FC<{ error: string | null; onRetry?: () => void }> = ({ error, onRetry }) =>
  error ? (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span className="flex-1">{error}</span>
      {onRetry && (
        <button onClick={onRetry} className="font-semibold underline">
          Retry
        </button>
      )}
    </div>
  ) : null;

export const Tabs: React.FC<{ tabs: { key: string; label: string; count?: number }[]; active: string; onChange: (k: string) => void }> = ({
  tabs,
  active,
  onChange
}) => (
  <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar border-b border-slate-200 bg-white px-4 sm:px-6 shrink-0">
    {tabs.map((t) => (
      <button
        key={t.key}
        onClick={() => onChange(t.key)}
        className={`px-3 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 -mb-px transition ${
          active === t.key ? 'border-violet-600 text-violet-700' : 'border-transparent text-slate-500 hover:text-slate-800'
        }`}
      >
        {t.label}
        {typeof t.count === 'number' && <span className="ml-1 text-[10px] text-slate-400 tabular-nums">{t.count}</span>}
      </button>
    ))}
  </div>
);

/** Lightweight toast used across billing screens. */
export const Toast: React.FC<{ message: string | null; tone?: 'ok' | 'err'; onDone: () => void }> = ({ message, tone = 'ok', onDone }) => {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!message) return null;
  return (
    <div
      role="status"
      className={`fixed bottom-20 md:bottom-6 right-6 z-[90] px-4 py-2.5 rounded-lg shadow-lg text-xs font-semibold ${
        tone === 'ok' ? 'bg-slate-900 text-white' : 'bg-rose-600 text-white'
      }`}
    >
      {message}
    </div>
  );
};

/** Table shell with consistent header styling. */
export const Table: React.FC<{ head: React.ReactNode; children: React.ReactNode }> = ({ head, children }) => (
  <div className="overflow-x-auto custom-scrollbar">
    <table className="w-full text-xs">
      <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
        <tr>{head}</tr>
      </thead>
      <tbody className="divide-y divide-slate-100">{children}</tbody>
    </table>
  </div>
);

export const Th: React.FC<{ children?: React.ReactNode; right?: boolean; className?: string }> = ({ children, right, className = '' }) => (
  <th className={`px-3 py-2 font-bold ${right ? 'text-right' : 'text-left'} ${className}`}>{children}</th>
);

export const Td: React.FC<{ children?: React.ReactNode; right?: boolean; className?: string; colSpan?: number }> = ({ children, right, className = '', colSpan }) => (
  <td colSpan={colSpan} className={`px-3 py-2 ${right ? 'text-right tabular-nums' : ''} ${className}`}>
    {children}
  </td>
);
