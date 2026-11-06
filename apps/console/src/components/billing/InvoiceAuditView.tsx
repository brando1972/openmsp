import React, { useCallback, useEffect, useState } from 'react';
import type { BillingDocument } from '@openmsp/api-types';
import { BadgeCheck, RefreshCw, ShieldCheck, AlertTriangle, CheckCircle2, Wrench, Eye } from 'lucide-react';
import { billingApi } from '../../services/billingApi';
import { useBilling } from '../../data/BillingContext';
import { PageHeader, Stat, Loading, ErrorBanner, EmptyState, btn, StatusBadge, Toast } from './ui';
import { money, shortDate } from './format';

const SEV_DOT: Record<string, string> = { critical: 'bg-rose-500', warning: 'bg-amber-500', info: 'bg-sky-500' };

/**
 * InvoiceAuditView — review queue before invoices go out. Contract-generated
 * invoices (and drafts) are checked against live data: billed device/user counts
 * vs RMM/MDM, unbilled ticket time, $0 totals, big swings vs the last invoice,
 * missing billing email, duplicate periods and missing tax.
 */
export const InvoiceAuditView: React.FC = () => {
  const { openDocument, openClient, settings, version, bump } = useBilling();
  const cur = settings?.currency || 'USD';
  const [rows, setRows] = useState<BillingDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ m: string; t?: 'ok' | 'err' } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await billingApi.auditQueue());
    } catch (e) {
      setError((e as Error).message);
      setRows([]);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, version]);

  const act = async (id: string, fn: () => Promise<unknown>, msg: string) => {
    setBusy(id);
    try {
      await fn();
      bump();
      setToast({ m: msg });
    } catch (e) {
      setToast({ m: (e as Error).message, t: 'err' });
    } finally {
      setBusy(null);
    }
  };

  const approveSelected = async (send: boolean) => {
    const ids = Array.from(sel);
    setBusy('bulk');
    let ok = 0;
    const errs: string[] = [];
    for (const id of ids) {
      try {
        await billingApi.approve(id, send);
        ok++;
      } catch (e) {
        errs.push((e as Error).message);
      }
    }
    setSel(new Set());
    bump();
    setBusy(null);
    setToast(errs.length ? { m: `${ok} approved, ${errs.length} failed: ${errs[0]}`, t: 'err' } : { m: `${ok} invoice${ok === 1 ? '' : 's'} approved${send ? ' and sent' : ''}` });
  };

  const review = (rows || []).filter((d) => d.status === 'pending_review');
  const drafts = (rows || []).filter((d) => d.status === 'draft');
  const flagged = (rows || []).filter((d) => (d.auditFlags || []).some((f) => f.severity !== 'info'));
  const clean = review.filter((d) => !(d.auditFlags || []).some((f) => f.severity !== 'info'));

  const Section: React.FC<{ title: string; docs: BillingDocument[]; selectable?: boolean }> = ({ title, docs, selectable }) =>
    docs.length === 0 ? null : (
      <div className="space-y-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">{title}</div>
        {docs.map((d) => {
          const flags = d.auditFlags || [];
          const fixable = flags.some((f) => f.suggestedQuantity !== undefined);
          return (
            <div key={d.id} className={`bg-white rounded-xl border shadow-sm ${flags.some((f) => f.severity === 'critical') ? 'border-rose-200' : flags.length ? 'border-amber-200' : 'border-slate-200'}`}>
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                {selectable && (
                  <input
                    type="checkbox"
                    aria-label={`Select ${d.number}`}
                    checked={sel.has(d.id)}
                    onChange={(e) => {
                      const n = new Set(sel);
                      if (e.target.checked) n.add(d.id);
                      else n.delete(d.id);
                      setSel(n);
                    }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button className="font-bold text-violet-700 text-xs hover:underline" onClick={() => openDocument(d.id, 'invoice')}>
                      {d.number}
                    </button>
                    <StatusBadge status={d.status} />
                    {d.contractId && <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 rounded px-1">RECURRING</span>}
                    {flags.length === 0 ? (
                      <span className="flex items-center gap-1 text-[11px] text-emerald-700 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" /> All checks passed
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] text-amber-700 font-semibold">
                        <AlertTriangle className="w-3.5 h-3.5" /> {flags.length} flag{flags.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    <button className="hover:underline font-medium text-slate-700" onClick={() => openClient(d.clientId)}>
                      {d.clientName}
                    </button>
                    {' · '}
                    {shortDate(d.issueDate)}
                    {d.servicePeriod && ` · period ${shortDate(d.servicePeriod.start)} – ${shortDate(d.servicePeriod.end)}`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold tabular-nums">{money(d.total, cur)}</div>
                  <div className="text-[10px] text-slate-400">{d.lines.length} line{d.lines.length === 1 ? '' : 's'}</div>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  <button className={btn.ghost} onClick={() => openDocument(d.id, 'invoice')} title="Open">
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  {fixable && (
                    <button className={btn.secondary} disabled={busy === d.id} onClick={() => act(d.id, () => billingApi.applyAuditFixes(d.id), 'Quantities updated to live counts')}>
                      <Wrench className="w-3.5 h-3.5" /> Fix counts
                    </button>
                  )}
                  <button className={btn.secondary} disabled={busy === d.id} onClick={() => act(d.id, () => billingApi.reaudit(d.id), 'Re-checked')}>
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  <button className={btn.secondary} disabled={busy === d.id} onClick={() => act(d.id, () => billingApi.approve(d.id, false), 'Approved')}>
                    Approve
                  </button>
                  <button className={btn.success} disabled={busy === d.id} onClick={() => act(d.id, () => billingApi.approve(d.id, true), 'Approved and sent')}>
                    <ShieldCheck className="w-3.5 h-3.5" /> Approve &amp; send
                  </button>
                </div>
              </div>
              {flags.length > 0 && (
                <ul className="px-4 pb-3 pt-0 space-y-1">
                  {flags.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-[11px] text-slate-700">
                      <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${SEV_DOT[f.severity]}`} />
                      <span>{f.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    );

  return (
    <>
      <PageHeader Icon={BadgeCheck} tint="#84cc16" title="Invoice Audit" count={rows?.length} subtitle="Check invoices against live assets, time and history before they reach clients">
        <button className={btn.secondary} onClick={load} title="Refresh">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        {sel.size > 0 && (
          <>
            <button className={btn.secondary} disabled={busy === 'bulk'} onClick={() => approveSelected(false)}>
              Approve {sel.size}
            </button>
            <button className={btn.success} disabled={busy === 'bulk'} onClick={() => approveSelected(true)}>
              <ShieldCheck className="w-3.5 h-3.5" /> Approve &amp; send {sel.size}
            </button>
          </>
        )}
      </PageHeader>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-6 pb-20 md:pb-6 space-y-4">
        <ErrorBanner error={error} onRetry={load} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Awaiting review" value={review.length} tone={review.length ? 'warn' : 'default'} />
          <Stat label="With warnings" value={flagged.length} tone={flagged.length ? 'bad' : 'default'} />
          <Stat label="Ready to approve" value={clean.length} tone="good" sub={clean.length ? <button className="underline" onClick={() => setSel(new Set(clean.map((d) => d.id)))}>Select all clean</button> : undefined} />
          <Stat label="Drafts" value={drafts.length} />
        </div>
        {!rows ? (
          <Loading />
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200">
            <EmptyState Icon={ShieldCheck} title="Nothing to review" body="Contract invoices that need review show up here, along with any drafts. Each one is checked against live device counts, unbilled time and the client's last invoice." />
          </div>
        ) : (
          <>
            <Section title="Needs review" docs={review} selectable />
            <Section title="Drafts" docs={drafts} selectable />
          </>
        )}
      </div>
      <Toast message={toast?.m || null} tone={toast?.t} onDone={() => setToast(null)} />
    </>
  );
};

export default InvoiceAuditView;
