import React, { useEffect, useMemo, useState } from 'react';
import type { BillingDocument, PaymentMethod } from '@openmsp/api-types';
import { billingApi } from '../../services/billingApi';
import { useBilling } from '../../data/BillingContext';
import { Modal, Field, btn, input, ErrorBanner, Loading } from './ui';
import { money, shortDate, today, METHOD_LABEL } from './format';

/**
 * RecordPaymentModal — record a check/cash/ACH/manual payment and allocate it
 * across one or more open invoices (Zoho-style). Any unallocated amount becomes
 * client credit. Used from invoices, the payments list and Client 360.
 */
export const RecordPaymentModal: React.FC<{
  clientId?: string;
  invoiceId?: string;
  onClose: () => void;
  onSaved: () => void;
}> = ({ clientId: initialClientId, invoiceId, onClose, onSaved }) => {
  const { billingClients, settings, bump } = useBilling();
  const cur = settings?.currency || 'USD';
  const [clientId, setClientId] = useState(initialClientId || '');
  const [openInvoices, setOpenInvoices] = useState<BillingDocument[] | null>(null);
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [amount, setAmount] = useState('');
  const [amountTouched, setAmountTouched] = useState(false);
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState<PaymentMethod>('check');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // If opened from an invoice without clientId, resolve the client from it.
  useEffect(() => {
    if (clientId || !invoiceId) return;
    billingApi
      .document(invoiceId)
      .then((d) => setClientId(d.clientId))
      .catch((e) => setError((e as Error).message));
  }, [clientId, invoiceId]);

  useEffect(() => {
    if (!clientId) {
      setOpenInvoices(null);
      return;
    }
    setOpenInvoices(null);
    billingApi
      .documents({ type: 'invoice', clientId })
      .then((docs) => {
        const open = docs
          .filter((d) => d.balanceDue > 0 && ['sent', 'partially_paid', 'overdue'].includes(d.status))
          .sort((a, b) => (a.dueDate || a.issueDate).localeCompare(b.dueDate || b.issueDate));
        setOpenInvoices(open);
        if (invoiceId) {
          const inv = open.find((d) => d.id === invoiceId);
          if (inv) {
            setAlloc({ [inv.id]: inv.balanceDue.toFixed(2) });
            setAmount(inv.balanceDue.toFixed(2));
          }
        }
      })
      .catch((e) => setError((e as Error).message));
  }, [clientId, invoiceId]);

  const allocTotal = useMemo(
    () => Object.values(alloc).reduce((s, v) => s + (parseFloat(v) || 0), 0),
    [alloc]
  );
  const amt = parseFloat(amount) || 0;
  const unapplied = Math.round((amt - allocTotal) * 100) / 100;

  const setLine = (id: string, v: string) => {
    const next = { ...alloc, [id]: v };
    setAlloc(next);
    if (!amountTouched) {
      setAmount(Object.values(next).reduce((s, x) => s + (parseFloat(x) || 0), 0).toFixed(2));
    }
  };

  /** Spread the entered amount across invoices, oldest due first. */
  const autoAllocate = () => {
    if (!openInvoices) return;
    let left = amt;
    const next: Record<string, string> = {};
    for (const inv of openInvoices) {
      if (left <= 0) break;
      const a = Math.min(left, inv.balanceDue);
      next[inv.id] = a.toFixed(2);
      left = Math.round((left - a) * 100) / 100;
    }
    setAlloc(next);
  };

  const payAll = () => {
    if (!openInvoices) return;
    const next: Record<string, string> = {};
    openInvoices.forEach((i) => (next[i.id] = i.balanceDue.toFixed(2)));
    setAlloc(next);
    setAmount(openInvoices.reduce((s, i) => s + i.balanceDue, 0).toFixed(2));
  };

  const save = async () => {
    setError(null);
    if (!clientId) return setError('Choose a client.');
    if (amt <= 0) return setError('Enter a payment amount greater than zero.');
    if (unapplied < -0.005) return setError('Allocated amount is more than the payment amount.');
    for (const inv of openInvoices || []) {
      const a = parseFloat(alloc[inv.id] || '0') || 0;
      if (a - inv.balanceDue > 0.005) return setError(`Allocation for ${inv.number} exceeds its balance of ${money(inv.balanceDue, cur)}.`);
    }
    setSaving(true);
    try {
      await billingApi.recordPayment({
        clientId,
        amount: amt,
        date,
        method,
        reference: reference || undefined,
        notes: notes || undefined,
        allocations: Object.entries(alloc)
          .map(([invoiceId, v]) => ({ invoiceId, amount: Math.round((parseFloat(v) || 0) * 100) / 100 }))
          .filter((a) => a.amount > 0)
      });
      bump();
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Record payment"
      onClose={onClose}
      width="max-w-2xl"
      footer={
        <>
          <button className={btn.secondary} onClick={onClose}>
            Cancel
          </button>
          <button className={btn.success} onClick={save} disabled={saving || !clientId}>
            {saving ? 'Saving…' : `Record ${money(amt, cur)}`}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorBanner error={error} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Client">
            <select className={input} value={clientId} onChange={(e) => { setClientId(e.target.value); setAlloc({}); }} disabled={!!initialClientId}>
              <option value="">Select a client…</option>
              {billingClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Amount received">
            <input
              className={input}
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setAmountTouched(true);
              }}
              placeholder="0.00"
            />
          </Field>
          <Field label="Payment date">
            <input className={input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Method">
            <select className={input} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {(Object.keys(METHOD_LABEL) as PaymentMethod[])
                .filter((m) => !m.startsWith('stripe'))
                .map((m) => (
                  <option key={m} value={m}>
                    {METHOD_LABEL[m]}
                  </option>
                ))}
            </select>
          </Field>
          <Field label={method === 'check' ? 'Check #' : 'Reference'}>
            <input className={input} value={reference} onChange={(e) => setReference(e.target.value)} placeholder={method === 'check' ? '1042' : 'Transaction ID'} />
          </Field>
          <Field label="Notes (internal)">
            <input className={input} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>

        {clientId && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
              <div className="text-[11px] font-bold text-slate-600">Apply to open invoices</div>
              <div className="flex gap-1">
                <button className={btn.ghost} onClick={payAll} disabled={!openInvoices?.length}>
                  Pay all
                </button>
                <button className={btn.ghost} onClick={autoAllocate} disabled={!openInvoices?.length || amt <= 0}>
                  Auto-apply oldest first
                </button>
              </div>
            </div>
            {!openInvoices ? (
              <Loading label="Loading open invoices…" />
            ) : openInvoices.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-slate-500">
                No open invoices. The full amount will be kept as client credit.
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                  <tr>
                    <th className="text-left px-3 py-1.5">Invoice</th>
                    <th className="text-left px-3 py-1.5">Due</th>
                    <th className="text-right px-3 py-1.5">Balance</th>
                    <th className="text-right px-3 py-1.5 w-32">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {openInvoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="px-3 py-1.5 font-semibold">
                        {inv.number}
                        {inv.status === 'overdue' && <span className="ml-1.5 text-[10px] text-rose-600 font-bold">OVERDUE</span>}
                      </td>
                      <td className="px-3 py-1.5 text-slate-500">{shortDate(inv.dueDate)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{money(inv.balanceDue, cur)}</td>
                      <td className="px-3 py-1">
                        <input
                          className={`${input} text-right`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={alloc[inv.id] || ''}
                          onChange={(e) => setLine(inv.id, e.target.value)}
                          placeholder="0.00"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 text-xs">
          <div>
            Applied: <span className="font-bold tabular-nums">{money(allocTotal, cur)}</span>
          </div>
          <div className={unapplied < -0.005 ? 'text-rose-600' : unapplied > 0 ? 'text-amber-700' : 'text-slate-500'}>
            {unapplied >= 0 ? 'Kept as client credit' : 'Over-allocated'}:{' '}
            <span className="font-bold tabular-nums">{money(Math.abs(unapplied), cur)}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default RecordPaymentModal;
