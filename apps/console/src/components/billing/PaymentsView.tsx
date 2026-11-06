import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { BillingPayment } from '@openmsp/api-types';
import { Wallet, Plus, Search, RefreshCw, Ban } from 'lucide-react';
import { billingApi } from '../../services/billingApi';
import { useBilling } from '../../data/BillingContext';
import { PageHeader, Stat, Loading, ErrorBanner, EmptyState, Table, Th, Td, btn, input, Modal, Toast } from './ui';
import { METHOD_LABEL, money, shortDate, today } from './format';
import { RecordPaymentModal } from './RecordPaymentModal';

/** PaymentsView — all payments received (manual + Stripe) with their invoice allocations. */
export const PaymentsView: React.FC = () => {
  const { openDocument, openClient, settings, version, bump } = useBilling();
  const cur = settings?.currency || 'USD';
  const [rows, setRows] = useState<BillingPayment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [voiding, setVoiding] = useState<BillingPayment | null>(null);
  const [toast, setToast] = useState<{ m: string; t?: 'ok' | 'err' } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await billingApi.payments());
    } catch (e) {
      setError((e as Error).message);
      setRows([]);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, version]);

  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return (rows || [])
      .filter((p) => !s || `${p.number} ${p.clientName} ${p.reference || ''} ${p.allocations.map((a) => a.invoiceNumber).join(' ')}`.toLowerCase().includes(s))
      .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
  }, [rows, q]);

  const month = today().slice(0, 7);
  const live = (rows || []).filter((p) => !p.voided);
  const thisMonth = live.filter((p) => p.date.startsWith(month)).reduce((s, p) => s + p.amount, 0);
  const unapplied = live.reduce((s, p) => s + p.unapplied, 0);
  const online = live.filter((p) => p.method.startsWith('stripe')).reduce((s, p) => s + p.amount, 0);

  return (
    <>
      <PageHeader Icon={Wallet} tint="#10b981" title="Payments Received" count={rows?.length} subtitle="Checks, cash, ACH and Stripe payments with invoice allocations">
        <button className={btn.secondary} onClick={load} title="Refresh">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <button className={btn.primary} onClick={() => setShowNew(true)}>
          <Plus className="w-3.5 h-3.5" /> Record payment
        </button>
      </PageHeader>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-6 pb-20 md:pb-6 space-y-4">
        <ErrorBanner error={error} onRetry={load} />
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Stat label="Received this month" value={money(thisMonth, cur)} tone="good" />
          <Stat label="Paid online (all time)" value={money(online, cur)} />
          <Stat label="Unapplied (client credit)" value={money(unapplied, cur)} tone={unapplied > 0 ? 'warn' : 'default'} />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="p-3 border-b border-slate-100">
            <div className="relative max-w-sm">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input className={`${input} pl-8`} placeholder="Search payments, clients, invoices, check #…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          {!rows ? (
            <Loading />
          ) : filtered.length === 0 ? (
            <EmptyState Icon={Wallet} title={rows.length ? 'No matches' : 'No payments yet'} body="Record checks and transfers here; Stripe payments appear automatically." />
          ) : (
            <Table
              head={
                <>
                  <Th>Date</Th>
                  <Th>Payment #</Th>
                  <Th>Client</Th>
                  <Th className="hidden md:table-cell">Method</Th>
                  <Th>Applied to</Th>
                  <Th right>Amount</Th>
                  <Th right className="hidden sm:table-cell">Unapplied</Th>
                  <Th />
                </>
              }
            >
              {filtered.map((p) => (
                <tr key={p.id} className={p.voided ? 'opacity-50' : ''}>
                  <Td className="text-slate-500 whitespace-nowrap">{shortDate(p.date)}</Td>
                  <Td className={`font-semibold whitespace-nowrap ${p.voided ? 'line-through' : ''}`}>{p.number}</Td>
                  <Td>
                    <button className="hover:underline font-medium" onClick={() => openClient(p.clientId)}>
                      {p.clientName}
                    </button>
                  </Td>
                  <Td className="hidden md:table-cell text-slate-500">
                    {METHOD_LABEL[p.method]}
                    {p.reference && <span className="text-slate-400"> · {p.reference}</span>}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {p.allocations.length === 0 && <span className="text-slate-400">—</span>}
                      {p.allocations.map((a) => (
                        <button key={a.invoiceId} onClick={() => openDocument(a.invoiceId, 'invoice')} className="text-[10px] font-semibold text-violet-700 bg-violet-50 rounded px-1.5 py-0.5 hover:bg-violet-100">
                          {a.invoiceNumber} · {money(a.amount, cur)}
                        </button>
                      ))}
                    </div>
                  </Td>
                  <Td right className="font-semibold">{money(p.amount, cur)}</Td>
                  <Td right className={`hidden sm:table-cell ${p.unapplied > 0 ? 'text-amber-700' : 'text-slate-400'}`}>{money(p.unapplied, cur)}</Td>
                  <Td right>
                    {p.voided ? (
                      <span className="text-[10px] font-bold text-slate-400">VOID</span>
                    ) : (
                      <button className={btn.ghost} onClick={() => setVoiding(p)} title="Void payment">
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </div>
      {showNew && <RecordPaymentModal onClose={() => setShowNew(false)} onSaved={() => setToast({ m: 'Payment recorded' })} />}
      {voiding && (
        <Modal
          title={`Void payment ${voiding.number}?`}
          onClose={() => setVoiding(null)}
          footer={
            <>
              <button className={btn.secondary} onClick={() => setVoiding(null)}>Cancel</button>
              <button
                className={btn.danger}
                onClick={async () => {
                  try {
                    await billingApi.voidPayment(voiding.id);
                    bump();
                    setToast({ m: 'Payment voided' });
                  } catch (e) {
                    setToast({ m: (e as Error).message, t: 'err' });
                  }
                  setVoiding(null);
                }}
              >
                Void payment
              </button>
            </>
          }
        >
          <p className="text-xs text-slate-600">
            {money(voiding.amount, cur)} will be removed from {voiding.allocations.map((a) => a.invoiceNumber).join(', ') || 'client credit'} and those invoices will reopen. Use this for bounced checks or mistakes.
            {voiding.method.startsWith('stripe') && ' This does not refund the card — issue the refund in Stripe too.'}
          </p>
        </Modal>
      )}
      <Toast message={toast?.m || null} tone={toast?.t} onDone={() => setToast(null)} />
    </>
  );
};

export default PaymentsView;
