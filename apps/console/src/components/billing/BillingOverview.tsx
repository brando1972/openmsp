import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, Plus, RefreshCw, Receipt, FileText, AlertTriangle, ShieldCheck, ScrollText, Settings2 } from 'lucide-react';
import { billingApi, type BillingSummary } from '../../services/billingApi';
import { useBilling } from '../../data/BillingContext';
import { PageHeader, Stat, Card, Loading, ErrorBanner, btn } from './ui';
import { money } from './format';

/** BillingOverview — receivables dashboard: AR aging, MRR, review queue and setup checklist. */
export const BillingOverview: React.FC = () => {
  const { newDocument, goBilling, openClient, openContract, settings, taxRates, version } = useBilling();
  const cur = settings?.currency || 'USD';
  const [s, setS] = useState<BillingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setS(await billingApi.summary());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, version]);

  const agingTotal = s ? Object.values(s.aging).reduce((a, b) => a + b, 0) : 0;
  const buckets: { k: keyof BillingSummary['aging']; label: string; color: string }[] = [
    { k: 'current', label: 'Current', color: '#22c55e' },
    { k: 'd1_30', label: '1–30 days', color: '#eab308' },
    { k: 'd31_60', label: '31–60 days', color: '#f97316' },
    { k: 'd61_90', label: '61–90 days', color: '#ef4444' },
    { k: 'd90_plus', label: '90+ days', color: '#991b1b' }
  ];

  const setup = [
    { done: !!settings?.companyAddress?.line1 && !!settings?.companyEmail, label: 'Company details & logo', sub: 'billing-settings' },
    { done: taxRates.length > 0 && !(taxRates.length === 1 && taxRates[0].name === 'Sales Tax' && taxRates[0].ratePct === 8.25), label: 'Your sales tax rates', sub: 'items' },
    { done: !!settings?.emailConfigured, label: 'Email delivery (Resend or SMTP)', sub: 'billing-settings' },
    { done: !!settings?.stripeConfigured, label: 'Stripe online payments', sub: 'billing-settings' }
  ];

  return (
    <>
      <PageHeader Icon={BarChart3} tint="#0ea5e9" title="Billing Overview" subtitle="Receivables, recurring revenue and what needs your attention">
        <button className={btn.secondary} onClick={load} title="Refresh">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <button className={btn.secondary} onClick={() => newDocument('quote')}>
          <FileText className="w-3.5 h-3.5" /> New quote
        </button>
        <button className={btn.primary} onClick={() => newDocument('invoice')}>
          <Plus className="w-3.5 h-3.5" /> New invoice
        </button>
      </PageHeader>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-6 pb-20 md:pb-6 space-y-4">
        <ErrorBanner error={error} onRetry={load} />
        {!s && !error ? (
          <Loading />
        ) : s ? (
          <>
            {setup.some((x) => !x.done) && (
              <Card title={<span className="flex items-center gap-1.5"><Settings2 className="w-3.5 h-3.5" /> Finish billing setup</span>}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {setup.map((x) => (
                    <button
                      key={x.label}
                      onClick={() => goBilling(x.sub)}
                      className={`text-left px-3 py-2 rounded-lg border text-xs transition ${x.done ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 hover:border-violet-300 text-slate-700'}`}
                    >
                      <span className="mr-1.5">{x.done ? '✓' : '○'}</span>
                      {x.label}
                    </button>
                  ))}
                </div>
              </Card>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="Total receivables" value={money(s.outstanding, cur)} onClick={() => goBilling('invoices')} />
              <Stat label="Overdue" value={money(s.overdue, cur)} tone={s.overdue > 0 ? 'bad' : 'default'} sub={`${s.overdueCount} invoice${s.overdueCount === 1 ? '' : 's'}`} onClick={() => goBilling('invoices')} />
              <Stat label="Monthly recurring (MRR)" value={money(s.mrr, cur)} tone="good" sub={`${s.activeContracts} active contract${s.activeContracts === 1 ? '' : 's'}`} onClick={() => goBilling('contracts')} />
              <Stat label="Collected this month" value={money(s.collectedThisMonth, cur)} sub={`Invoiced ${money(s.invoicedThisMonth, cur)}`} onClick={() => goBilling('payments')} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card title="Receivables aging" className="lg:col-span-2">
                {agingTotal === 0 ? (
                  <div className="text-xs text-slate-500 py-6 text-center">Nothing outstanding. 🎉</div>
                ) : (
                  <>
                    <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
                      {buckets.map((b) =>
                        s.aging[b.k] > 0 ? <div key={b.k} style={{ width: `${(s.aging[b.k] / agingTotal) * 100}%`, background: b.color }} title={`${b.label}: ${money(s.aging[b.k], cur)}`} /> : null
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
                      {buckets.map((b) => (
                        <div key={b.k}>
                          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            <span className="w-2 h-2 rounded-full" style={{ background: b.color }} /> {b.label}
                          </div>
                          <div className="text-sm font-bold tabular-nums mt-0.5">{money(s.aging[b.k], cur)}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </Card>

              <Card title="Needs attention">
                <div className="space-y-2 text-xs">
                  <Attn Icon={ShieldCheck} tone="amber" label="Invoices awaiting audit review" n={s.pendingReviewCount} onClick={() => goBilling('invoice-audit')} />
                  <Attn Icon={AlertTriangle} tone="rose" label="Overdue invoices" n={s.overdueCount} onClick={() => goBilling('invoices')} />
                  <Attn Icon={Receipt} tone="slate" label="Draft invoices" n={s.draftCount} onClick={() => goBilling('invoices')} />
                  <Attn Icon={FileText} tone="violet" label={`Open quotes (${money(s.openQuotesTotal, cur)})`} n={s.openQuotesCount} onClick={() => goBilling('quotes')} />
                  <Attn Icon={ScrollText} tone="emerald" label="Set up a recurring contract" n={-1} onClick={() => openContract('new')} />
                </div>
              </Card>
            </div>

            <Card title="Top balances by client" padded={false}>
              {s.topClientsByOutstanding.length === 0 ? (
                <div className="text-xs text-slate-500 py-6 text-center">No open balances.</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {s.topClientsByOutstanding.map((c) => (
                    <li key={c.clientId}>
                      <button onClick={() => openClient(c.clientId)} className="w-full flex items-center justify-between px-4 py-2 text-xs hover:bg-slate-50">
                        <span className="font-semibold text-slate-800">{c.clientName}</span>
                        <span className="tabular-nums font-semibold">{money(c.outstanding, cur)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        ) : null}
      </div>
    </>
  );
};

const TONE: Record<string, string> = {
  amber: 'text-amber-500',
  rose: 'text-rose-500',
  slate: 'text-slate-500',
  violet: 'text-violet-500',
  emerald: 'text-emerald-500'
};

const Attn: React.FC<{ Icon: React.ComponentType<{ className?: string }>; label: string; n: number; tone: string; onClick: () => void }> = ({ Icon, label, n, tone, onClick }) => (
  <button onClick={onClick} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border border-slate-200 hover:border-violet-300 transition text-left">
    <Icon className={`w-4 h-4 ${TONE[tone] || 'text-slate-500'}`} />
    <span className="flex-1 text-slate-700">{label}</span>
    {n >= 0 && <span className={`tabular-nums font-bold ${n > 0 ? 'text-slate-900' : 'text-slate-300'}`}>{n}</span>}
  </button>
);

export default BillingOverview;
