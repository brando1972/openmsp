import React, { useEffect, useMemo, useState } from 'react';
import type { BillingDocument, BillingLineItem, CatalogItem, PaymentTerms, UnbilledTimeEntry, ManagedDevice } from '@openmsp/api-types';
import { ArrowDown, ArrowUp, Clock, Monitor, Plus, Trash2, Package, Save, Send } from 'lucide-react';
import { billingApi, clientsApi } from '../../services/billingApi';
import { useBilling } from '../../data/BillingContext';
import { PageHeader, Field, btn, input, ErrorBanner, Loading, Modal, Card } from './ui';
import { DOC_LABEL, TERMS_DAYS, TERMS_LABEL, addDays, computeTotals, money, newId, today, shortDate } from './format';
import { requestSendOnOpen } from './DocumentDetail';
import { Receipt } from 'lucide-react';

type Draft = Omit<BillingDocument, 'id' | 'orgId' | 'number' | 'publicToken' | 'history' | 'createdBy' | 'createdAt' | 'updatedAt' | 'subtotal' | 'discountTotal' | 'taxTotal' | 'total' | 'amountPaid' | 'creditsApplied' | 'balanceDue'> & {
  id?: string;
  number?: string;
};

const blankLine = (): BillingLineItem => ({ id: newId(), name: '', quantity: 1, unitPrice: 0, taxable: true, source: 'manual' });

/**
 * DocumentEditor — create / edit quotes, sales orders, invoices and credit notes.
 * Lines can come from the catalog, unbilled ticket time, live device counts, or be typed freehand.
 */
export const DocumentEditor: React.FC = () => {
  const { editor, closeEditor, openDocument, billingClients, taxRates, items, settings, bump } = useBilling();
  const cur = settings?.currency || 'USD';
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<null | 'catalog' | 'time' | 'devices'>(null);

  // initialise
  useEffect(() => {
    if (!editor) return;
    if (editor.mode === 'edit') {
      billingApi
        .document(editor.docId)
        .then((d) => setDraft({ ...d }))
        .catch((e) => setError((e as Error).message));
      return;
    }
    const type = editor.type;
    const issue = today();
    const terms: PaymentTerms = settings?.defaultPaymentTerms || 'net_30';
    const base: Draft = {
      type,
      clientId: '',
      clientName: '',
      status: type === 'credit_note' ? 'open' : 'draft',
      issueDate: issue,
      paymentTerms: type === 'invoice' ? terms : undefined,
      dueDate: type === 'invoice' ? addDays(issue, TERMS_DAYS[terms]) : undefined,
      expiryDate: type === 'quote' ? addDays(issue, settings?.quoteValidityDays || 30) : undefined,
      lines: editor.lines?.length ? editor.lines : [blankLine()],
      notes: type === 'quote' ? settings?.defaultQuoteNotes : type === 'invoice' ? settings?.defaultInvoiceNotes : undefined,
      terms: type === 'quote' ? settings?.defaultQuoteTerms : type === 'invoice' ? settings?.defaultInvoiceTerms : undefined
    };
    setDraft(base);
    if (editor.clientId) applyClient(editor.clientId, base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const client = useMemo(() => billingClients.find((c) => c.id === draft?.clientId), [billingClients, draft?.clientId]);

  const applyClient = (clientId: string, from?: Draft) => {
    const c = billingClients.find((x) => x.id === clientId);
    setDraft((d) => {
      const cur0 = from || d;
      if (!cur0) return cur0;
      const terms = (cur0.type === 'invoice' && c?.paymentTerms) || cur0.paymentTerms;
      return {
        ...cur0,
        clientId,
        clientName: c?.name || '',
        billingEmail: c?.billingEmail || c?.contactEmail || cur0.billingEmail,
        paymentTerms: terms,
        dueDate: cur0.type === 'invoice' && terms ? addDays(cur0.issueDate, TERMS_DAYS[terms]) : cur0.dueDate
      };
    });
  };

  const totals = useMemo(
    () =>
      draft
        ? computeTotals(draft.lines, { taxRates, defaultTaxRateId: client?.taxRateId, taxExempt: client?.taxExempt, discountPct: draft.discountPct })
        : null,
    [draft, taxRates, client]
  );

  if (!editor) return null;
  const type = editor.mode === 'new' ? editor.type : draft?.type || 'invoice';
  const label = DOC_LABEL[type];

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const setLine = (id: string, patch: Partial<BillingLineItem>) =>
    setDraft((d) => (d ? { ...d, lines: d.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) } : d));
  const removeLine = (id: string) => setDraft((d) => (d ? { ...d, lines: d.lines.filter((l) => l.id !== id) } : d));
  const moveLine = (idx: number, dir: -1 | 1) =>
    setDraft((d) => {
      if (!d) return d;
      const lines = [...d.lines];
      const j = idx + dir;
      if (j < 0 || j >= lines.length) return d;
      [lines[idx], lines[j]] = [lines[j], lines[idx]];
      return { ...d, lines };
    });
  const addLines = (newLines: BillingLineItem[]) =>
    setDraft((d) => {
      if (!d) return d;
      const existing = d.lines.filter((l) => l.name.trim() || l.unitPrice); // drop empty placeholder rows
      return { ...d, lines: [...existing, ...newLines] };
    });

  const lineFromItem = (it: CatalogItem, qty = 1): BillingLineItem => ({
    id: newId(),
    itemId: it.id,
    name: it.name,
    description: it.description,
    quantity: qty,
    unit: it.unit,
    unitPrice: it.unitPrice,
    taxable: it.taxable,
    source: 'catalog'
  });

  const save = async (andSend = false) => {
    if (!draft) return;
    setError(null);
    if (!draft.clientId) return setError('Choose a client.');
    const lines = draft.lines.filter((l) => l.name.trim());
    if (!lines.length) return setError('Add at least one line item with a name.');
    if (lines.some((l) => !(Number(l.quantity) > 0))) return setError('Every line needs a quantity greater than zero.');
    setSaving(true);
    try {
      const payload: Partial<BillingDocument> = {
        ...draft,
        lines: lines.map((l) => ({ ...l, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), discountPct: l.discountPct ? Number(l.discountPct) : undefined }))
      };
      const saved = draft.id ? await billingApi.updateDocument(draft.id, payload) : await billingApi.createDocument(payload);
      bump();
      if (andSend) requestSendOnOpen(saved.id);
      openDocument(saved.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    if (draft?.id) openDocument(draft.id);
    else closeEditor();
  };

  return (
    <>
      <PageHeader
        Icon={Receipt}
        tint="#22c55e"
        title={draft?.id ? `Edit ${label.one} ${draft.number || ''}` : `New ${label.one}`}
        subtitle={client ? client.name : 'Choose a client to start'}
        onBack={cancel}
      >
        <button className={btn.secondary} onClick={cancel}>
          Cancel
        </button>
        <button className={btn.secondary} onClick={() => save(false)} disabled={saving || !draft}>
          <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : type === 'credit_note' ? 'Save' : 'Save as draft'}
        </button>
        {type !== 'sales_order' && type !== 'credit_note' && (
          <button className={btn.primary} onClick={() => save(true)} disabled={saving || !draft}>
            <Send className="w-3.5 h-3.5" /> Save &amp; send
          </button>
        )}
      </PageHeader>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-6 pb-24 md:pb-6">
        {!draft ? (
          error ? <ErrorBanner error={error} /> : <Loading />
        ) : (
          <div className="max-w-6xl mx-auto space-y-4">
            <ErrorBanner error={error} />

            <Card>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Client *" className="md:col-span-1">
                  <select className={input} value={draft.clientId} onChange={(e) => applyClient(e.target.value)} disabled={!!draft.id}>
                    <option value="">Select a client…</option>
                    {billingClients
                      .filter((c) => c.status !== 'inactive' || c.id === draft.clientId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Send to (email)" hint={client && !draft.billingEmail ? 'Client has no billing email on file' : undefined}>
                  <input className={input} type="email" value={draft.billingEmail || ''} onChange={(e) => set('billingEmail', e.target.value)} placeholder="billing@client.com" />
                </Field>
                <Field label="Reference / PO #">
                  <input className={input} value={draft.reference || ''} onChange={(e) => set('reference', e.target.value)} />
                </Field>
                <Field label={`${label.one} date`}>
                  <input
                    className={input}
                    type="date"
                    value={draft.issueDate}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDraft((d) =>
                        d
                          ? {
                              ...d,
                              issueDate: v,
                              dueDate: d.type === 'invoice' && d.paymentTerms ? addDays(v, TERMS_DAYS[d.paymentTerms]) : d.dueDate
                            }
                          : d
                      );
                    }}
                  />
                </Field>
                {type === 'invoice' && (
                  <>
                    <Field label="Payment terms">
                      <select
                        className={input}
                        value={draft.paymentTerms || 'net_30'}
                        onChange={(e) => {
                          const t = e.target.value as PaymentTerms;
                          setDraft((d) => (d ? { ...d, paymentTerms: t, dueDate: addDays(d.issueDate, TERMS_DAYS[t]) } : d));
                        }}
                      >
                        {(Object.keys(TERMS_LABEL) as PaymentTerms[]).map((t) => (
                          <option key={t} value={t}>
                            {TERMS_LABEL[t]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Due date">
                      <input className={input} type="date" value={draft.dueDate || ''} onChange={(e) => set('dueDate', e.target.value)} />
                    </Field>
                  </>
                )}
                {type === 'quote' && (
                  <Field label="Valid until">
                    <input className={input} type="date" value={draft.expiryDate || ''} onChange={(e) => set('expiryDate', e.target.value)} />
                  </Field>
                )}
                <Field label="Subject" className="md:col-span-3">
                  <input className={input} value={draft.subject || ''} onChange={(e) => set('subject', e.target.value)} placeholder="e.g. Firewall replacement – main office" />
                </Field>
              </div>
            </Card>

            {/* Line items */}
            <Card
              title="Line items"
              padded={false}
              actions={
                <>
                  <button className={btn.secondary} onClick={() => setPicker('catalog')}>
                    <Package className="w-3.5 h-3.5" /> From catalog
                  </button>
                  <button className={btn.secondary} onClick={() => setPicker('time')} disabled={!draft.clientId} title={draft.clientId ? '' : 'Choose a client first'}>
                    <Clock className="w-3.5 h-3.5" /> Unbilled time
                  </button>
                  <button className={btn.secondary} onClick={() => setPicker('devices')} disabled={!draft.clientId} title={draft.clientId ? '' : 'Choose a client first'}>
                    <Monitor className="w-3.5 h-3.5" /> Device counts
                  </button>
                </>
              }
            >
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-xs min-w-[860px]">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                    <tr>
                      <th className="w-14" />
                      <th className="text-left px-2 py-2">Item / description</th>
                      <th className="text-right px-2 py-2 w-20">Qty</th>
                      <th className="text-right px-2 py-2 w-28">Rate</th>
                      <th className="text-right px-2 py-2 w-16">Disc %</th>
                      <th className="text-left px-2 py-2 w-40">Tax</th>
                      <th className="text-right px-2 py-2 w-28">Amount</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {draft.lines.map((l, idx) => (
                      <tr key={l.id} className="align-top">
                        <td className="px-1 py-2">
                          <div className="flex flex-col items-center gap-0.5 text-slate-300">
                            <button onClick={() => moveLine(idx, -1)} className="hover:text-slate-600" aria-label="Move up">
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button onClick={() => moveLine(idx, 1)} className="hover:text-slate-600" aria-label="Move down">
                              <ArrowDown className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className={`${input} font-semibold`}
                            list="catalog-items"
                            value={l.name}
                            placeholder="Type or pick an item"
                            onChange={(e) => {
                              const v = e.target.value;
                              const it = items.find((i) => i.active && i.name === v);
                              if (it && !l.itemId) setLine(l.id, { ...lineFromItem(it, l.quantity || 1), id: l.id });
                              else setLine(l.id, { name: v });
                            }}
                          />
                          <textarea
                            className={`${input} mt-1 text-[11px] text-slate-600`}
                            rows={1}
                            value={l.description || ''}
                            placeholder="Description (optional)"
                            onChange={(e) => setLine(l.id, { description: e.target.value })}
                          />
                          {l.source !== 'manual' && l.source !== 'catalog' && (
                            <div className="text-[10px] text-violet-600 mt-0.5 font-semibold">
                              {l.source === 'time_entry' ? 'From ticket time' : l.source === 'device_count' ? 'Live device count' : l.source === 'user_count' ? 'User count' : 'From contract'}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <input className={`${input} text-right`} type="number" min="0" step="0.01" value={l.quantity} onChange={(e) => setLine(l.id, { quantity: e.target.value as unknown as number })} />
                          {l.unit && <div className="text-[10px] text-slate-400 text-right mt-0.5">{l.unit}</div>}
                        </td>
                        <td className="px-2 py-2">
                          <input className={`${input} text-right`} type="number" step="0.01" value={l.unitPrice} onChange={(e) => setLine(l.id, { unitPrice: e.target.value as unknown as number })} />
                        </td>
                        <td className="px-2 py-2">
                          <input className={`${input} text-right`} type="number" min="0" max="100" step="0.5" value={l.discountPct ?? ''} onChange={(e) => setLine(l.id, { discountPct: e.target.value as unknown as number })} />
                        </td>
                        <td className="px-2 py-2">
                          <select
                            className={input}
                            value={!l.taxable ? '__none' : l.taxRateId || ''}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '__none') setLine(l.id, { taxable: false, taxRateId: undefined });
                              else setLine(l.id, { taxable: true, taxRateId: v || undefined });
                            }}
                            disabled={client?.taxExempt}
                          >
                            <option value="">{client?.taxExempt ? 'Client tax-exempt' : 'Default rate'}</option>
                            <option value="__none">Non-taxable</option>
                            {taxRates
                              .filter((t) => t.active)
                              .map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name} ({t.ratePct}%)
                                </option>
                              ))}
                          </select>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums font-semibold pt-3.5">{money(totals?.lineAmounts[idx]?.amount || 0, cur)}</td>
                        <td className="px-1 py-2 pt-3">
                          <button onClick={() => removeLine(l.id)} className="text-slate-300 hover:text-rose-500" aria-label="Remove line">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <datalist id="catalog-items">
                  {items
                    .filter((i) => i.active)
                    .map((i) => (
                      <option key={i.id} value={i.name}>
                        {money(i.unitPrice, cur)}
                        {i.unit ? ` / ${i.unit}` : ''}
                      </option>
                    ))}
                </datalist>
              </div>
              <div className="p-3 border-t border-slate-100">
                <button className={btn.ghost} onClick={() => addLines([blankLine()])}>
                  <Plus className="w-3.5 h-3.5" /> Add line
                </button>
              </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="lg:col-span-2">
                <div className="grid gap-3">
                  <Field label="Notes (visible to client)">
                    <textarea className={input} rows={3} value={draft.notes || ''} onChange={(e) => set('notes', e.target.value)} placeholder="Thank you for your business." />
                  </Field>
                  <Field label="Terms & conditions">
                    <textarea className={input} rows={3} value={draft.terms || ''} onChange={(e) => set('terms', e.target.value)} />
                  </Field>
                </div>
              </Card>
              <Card>
                <div className="space-y-2 text-xs">
                  <Row k="Sub total" v={money(totals?.subtotal, cur)} />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500 whitespace-nowrap">Discount %</span>
                    <input
                      className={`${input} w-20 text-right`}
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={draft.discountPct ?? ''}
                      onChange={(e) => set('discountPct', e.target.value === '' ? undefined : Number(e.target.value))}
                    />
                  </div>
                  {(totals?.discountTotal || 0) > 0 && <Row k="Discount" v={`− ${money(totals?.discountTotal, cur)}`} />}
                  <Row k={client?.taxExempt ? 'Tax (exempt)' : 'Tax'} v={money(totals?.taxTotal, cur)} />
                  <div className="border-t border-slate-200 pt-2 flex justify-between text-sm font-bold">
                    <span>Total</span>
                    <span className="tabular-nums">{money(totals?.total, cur)}</span>
                  </div>
                  {!taxRates.length && <div className="text-[10px] text-amber-700">No tax rates set up yet — add them under Items &amp; Tax Rates.</div>}
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>

      {picker === 'catalog' && (
        <CatalogPicker
          items={items.filter((i) => i.active)}
          currency={cur}
          onClose={() => setPicker(null)}
          onPick={(sel) => {
            addLines(sel.map((it) => lineFromItem(it)));
            setPicker(null);
          }}
        />
      )}
      {picker === 'time' && draft?.clientId && (
        <UnbilledTimePicker
          clientId={draft.clientId}
          currency={cur}
          excludeIds={draft.lines.flatMap((l) => l.sourceRef?.timeEntryIds || [])}
          onClose={() => setPicker(null)}
          onPick={(entries) => {
            addLines(
              entries.map((u) => ({
                id: newId(),
                name: `Labor – ${u.ticketNumber} ${u.ticketTitle}`,
                description: `${shortDate(u.entry.date)} · ${u.entry.technician}: ${u.entry.description}`,
                quantity: Math.round((u.entry.minutes / 60) * 100) / 100,
                unit: 'hr',
                unitPrice: u.entry.hourlyRate,
                taxable: false,
                source: 'time_entry',
                sourceRef: { ticketId: u.ticketId, timeEntryIds: [u.entry.id] }
              }))
            );
            setPicker(null);
          }}
        />
      )}
      {picker === 'devices' && draft?.clientId && (
        <DeviceCountPicker
          clientId={draft.clientId}
          items={items.filter((i) => i.active && i.type === 'per_device')}
          currency={cur}
          onClose={() => setPicker(null)}
          onPick={(lines) => {
            addLines(lines);
            setPicker(null);
          }}
        />
      )}
    </>
  );
};

const Row: React.FC<{ k: string; v: React.ReactNode }> = ({ k, v }) => (
  <div className="flex justify-between">
    <span className="text-slate-500">{k}</span>
    <span className="tabular-nums">{v}</span>
  </div>
);

// ---------------------------------------------------------------------------
// Pickers
// ---------------------------------------------------------------------------

const CatalogPicker: React.FC<{ items: CatalogItem[]; currency: string; onClose: () => void; onPick: (items: CatalogItem[]) => void }> = ({ items, currency, onClose, onPick }) => {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const shown = items.filter((i) => !q || `${i.name} ${i.sku || ''} ${i.description || ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal
      title="Add items from catalog"
      onClose={onClose}
      width="max-w-2xl"
      footer={
        <>
          <button className={btn.secondary} onClick={onClose}>
            Cancel
          </button>
          <button className={btn.primary} disabled={!sel.size} onClick={() => onPick(items.filter((i) => sel.has(i.id)))}>
            Add {sel.size || ''} item{sel.size === 1 ? '' : 's'}
          </button>
        </>
      }
    >
      <input className={`${input} mb-3`} placeholder="Search catalog…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      {shown.length === 0 ? (
        <div className="text-xs text-slate-500 text-center py-8">No catalog items. Add them under Items &amp; Tax Rates.</div>
      ) : (
        <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
          {shown.map((i) => (
            <label key={i.id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={sel.has(i.id)}
                onChange={(e) => {
                  const n = new Set(sel);
                  if (e.target.checked) n.add(i.id);
                  else n.delete(i.id);
                  setSel(n);
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-800">{i.name}</div>
                {i.description && <div className="text-[11px] text-slate-500 truncate">{i.description}</div>}
              </div>
              <span className="text-[10px] text-slate-400 uppercase">{i.type.replace('_', ' ')}</span>
              <span className="tabular-nums font-semibold w-24 text-right">
                {money(i.unitPrice, currency)}
                {i.unit && <span className="text-slate-400 font-normal">/{i.unit}</span>}
              </span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
};

const UnbilledTimePicker: React.FC<{
  clientId: string;
  currency: string;
  excludeIds: string[];
  onClose: () => void;
  onPick: (entries: UnbilledTimeEntry[]) => void;
}> = ({ clientId, currency, excludeIds, onClose, onPick }) => {
  const [rows, setRows] = useState<UnbilledTimeEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  useEffect(() => {
    clientsApi
      .overview(clientId)
      .then((o) => {
        const r = o.unbilledTime.filter((u) => !excludeIds.includes(u.entry.id));
        setRows(r);
        setSel(new Set(r.map((u) => u.entry.id)));
      })
      .catch((e) => setError((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);
  const total = (rows || []).filter((r) => sel.has(r.entry.id)).reduce((s, r) => s + r.amount, 0);
  return (
    <Modal
      title="Add unbilled ticket time"
      onClose={onClose}
      width="max-w-3xl"
      footer={
        <>
          <button className={btn.secondary} onClick={onClose}>
            Cancel
          </button>
          <button className={btn.primary} disabled={!sel.size} onClick={() => onPick((rows || []).filter((r) => sel.has(r.entry.id)))}>
            Add {sel.size} entr{sel.size === 1 ? 'y' : 'ies'} · {money(total, currency)}
          </button>
        </>
      }
    >
      <ErrorBanner error={error} />
      {!rows ? (
        !error && <Loading />
      ) : rows.length === 0 ? (
        <div className="text-xs text-slate-500 text-center py-8">No unbilled billable time for this client.</div>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-slate-500 font-bold bg-slate-50">
            <tr>
              <th className="px-2 py-1.5 w-6" />
              <th className="text-left px-2 py-1.5">Ticket</th>
              <th className="text-left px-2 py-1.5">Date · tech</th>
              <th className="text-left px-2 py-1.5">Work</th>
              <th className="text-right px-2 py-1.5">Time</th>
              <th className="text-right px-2 py-1.5">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.entry.id}>
                <td className="px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={sel.has(r.entry.id)}
                    onChange={(e) => {
                      const n = new Set(sel);
                      if (e.target.checked) n.add(r.entry.id);
                      else n.delete(r.entry.id);
                      setSel(n);
                    }}
                  />
                </td>
                <td className="px-2 py-1.5 font-semibold whitespace-nowrap">{r.ticketNumber}</td>
                <td className="px-2 py-1.5 text-slate-500 whitespace-nowrap">
                  {shortDate(r.entry.date)} · {r.entry.technician}
                </td>
                <td className="px-2 py-1.5 text-slate-600">{r.entry.description}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{(r.entry.minutes / 60).toFixed(2)}h</td>
                <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{money(r.amount, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
};

const osLabel: Record<string, string> = { windows: 'Windows', macos: 'macOS', linux: 'Linux', network: 'Network', android: 'Android', ios: 'iOS' };

const DeviceCountPicker: React.FC<{
  clientId: string;
  items: CatalogItem[];
  currency: string;
  onClose: () => void;
  onPick: (lines: BillingLineItem[]) => void;
}> = ({ clientId, items, currency, onClose, onPick }) => {
  const [devices, setDevices] = useState<ManagedDevice[] | null>(null);
  const [mdm, setMdm] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<{ key: string; label: string; count: number; deviceIds: string[]; itemId: string; on: boolean }[]>([]);
  useEffect(() => {
    clientsApi
      .overview(clientId)
      .then((o) => {
        setDevices(o.devices);
        setMdm(o.mdmDevices.length);
        const groups = new Map<string, string[]>();
        o.devices.filter((d) => d.health !== 'offline').forEach((d) => groups.set(d.os, [...(groups.get(d.os) || []), d.id]));
        const fallback = items[0]?.id || '';
        const r = Array.from(groups.entries()).map(([os, ids]) => ({ key: os, label: osLabel[os] || os, count: ids.length, deviceIds: ids, itemId: fallback, on: true }));
        if (o.mdmDevices.length) r.push({ key: 'mdm', label: 'MDM tablets', count: o.mdmDevices.length, deviceIds: [], itemId: fallback, on: true });
        setRows(r);
      })
      .catch((e) => setError((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);
  return (
    <Modal
      title="Bill from live device counts"
      onClose={onClose}
      width="max-w-2xl"
      footer={
        <>
          <button className={btn.secondary} onClick={onClose}>
            Cancel
          </button>
          <button
            className={btn.primary}
            disabled={!rows.some((r) => r.on && r.itemId)}
            onClick={() =>
              onPick(
                rows
                  .filter((r) => r.on && r.itemId)
                  .map((r) => {
                    const it = items.find((i) => i.id === r.itemId)!;
                    return {
                      id: newId(),
                      itemId: it.id,
                      name: `${it.name} – ${r.label}`,
                      description: it.description,
                      quantity: r.count,
                      unit: it.unit || 'device',
                      unitPrice: it.unitPrice,
                      taxable: it.taxable,
                      source: 'device_count' as const,
                      sourceRef: { deviceIds: r.deviceIds }
                    };
                  })
              )
            }
          >
            Add lines
          </button>
        </>
      }
    >
      <ErrorBanner error={error} />
      {!devices ? (
        !error && <Loading />
      ) : rows.length === 0 ? (
        <div className="text-xs text-slate-500 text-center py-8">This client has no active devices{mdm ? '' : ' or MDM tablets'}.</div>
      ) : (
        <>
          <p className="text-[11px] text-slate-500 mb-3">Counts are pulled live from RMM-enrolled devices (online/recently seen) and MDM tablets assigned to this client.</p>
          {!items.length && <div className="text-[11px] text-amber-700 mb-2">No per-device items in your catalog. Add one under Items &amp; Tax Rates.</div>}
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-slate-500 font-bold bg-slate-50">
              <tr>
                <th className="w-6" />
                <th className="text-left px-2 py-1.5">Group</th>
                <th className="text-right px-2 py-1.5">Count</th>
                <th className="text-left px-2 py-1.5">Bill as</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, i) => (
                <tr key={r.key}>
                  <td className="px-2 py-1.5">
                    <input type="checkbox" checked={r.on} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} />
                  </td>
                  <td className="px-2 py-1.5 font-semibold">{r.label}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.count}</td>
                  <td className="px-2 py-1">
                    <select className={input} value={r.itemId} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, itemId: e.target.value } : x)))}>
                      <option value="">Choose item…</option>
                      {items.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.name} ({money(it.unitPrice, currency)})
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Modal>
  );
};

export default DocumentEditor;
