import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Contract, ContractLine, ContractQuantityMode, BillingFrequency, PaymentTerms, DeviceOS, CatalogItem } from '@openmsp/api-types';
import { ScrollText, Plus, RefreshCw, Search, Trash2, Zap, Save, Pause, Play } from 'lucide-react';
import { billingApi, type ContractPreview } from '../../services/billingApi';
import { useBilling } from '../../data/BillingContext';
import { PageHeader, Stat, Loading, ErrorBanner, EmptyState, Table, Th, Td, btn, input, Field, Card, StatusBadge, Toast, Modal } from './ui';
import { FREQ_LABEL, TERMS_LABEL, money, newId, shortDate, today } from './format';

/** ContractsView — recurring agreements that auto-generate invoices (flat fees + live per-device / per-user counts). */
export const ContractsView: React.FC = () => {
  const { contractEditorId, openContract, openClient, settings, version } = useBilling();
  const cur = settings?.currency || 'USD';
  const [rows, setRows] = useState<Contract[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await billingApi.contracts());
    } catch (e) {
      setError((e as Error).message);
      setRows([]);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, version]);

  const filtered = useMemo(
    () =>
      (rows || [])
        .filter((c) => status === 'all' || c.status === status)
        .filter((c) => !q || `${c.number} ${c.name} ${c.clientName}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => a.clientName.localeCompare(b.clientName)),
    [rows, q, status]
  );

  if (contractEditorId) return <ContractEditor key={contractEditorId} id={contractEditorId} />;

  const active = (rows || []).filter((c) => c.status === 'active');
  const mrr = active.reduce((s, c) => s + (c.mrr || 0), 0);
  const nextUp = [...active].sort((a, b) => a.nextInvoiceDate.localeCompare(b.nextInvoiceDate))[0];

  return (
    <>
      <PageHeader Icon={ScrollText} tint="#10b981" title="All Contracts" count={rows?.length} subtitle="Recurring agreements — invoices generate automatically and land in Invoice Audit">
        <button className={btn.secondary} onClick={load} title="Refresh">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <button className={btn.primary} onClick={() => openContract('new')}>
          <Plus className="w-3.5 h-3.5" /> New contract
        </button>
      </PageHeader>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-6 pb-20 md:pb-6 space-y-4">
        <ErrorBanner error={error} onRetry={load} />
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Stat label="Monthly recurring revenue" value={money(mrr, cur)} tone="good" />
          <Stat label="Active contracts" value={active.length} />
          <Stat label="Next invoice run" value={nextUp ? shortDate(nextUp.nextInvoiceDate) : '—'} sub={nextUp ? nextUp.clientName : undefined} />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 p-3 border-b border-slate-100">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input className={`${input} pl-8`} placeholder="Search contracts or clients…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {['all', 'active', 'draft', 'paused', 'expired', 'cancelled'].map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold border ${status === s ? 'bg-violet-50 border-violet-300 text-violet-700' : 'bg-white border-slate-200 text-slate-500'}`}
              >
                {s[0].toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          {!rows ? (
            <Loading />
          ) : filtered.length === 0 ? (
            <EmptyState
              Icon={ScrollText}
              title={rows.length ? 'No matches' : 'No contracts yet'}
              body="Create a managed-services contract with flat fees and per-device or per-user pricing. ApexMSP counts devices live from RMM/MDM on every billing run."
              action={!rows.length ? <button className={btn.primary} onClick={() => openContract('new')}><Plus className="w-3.5 h-3.5" /> New contract</button> : undefined}
            />
          ) : (
            <Table
              head={
                <>
                  <Th>Contract</Th>
                  <Th>Client</Th>
                  <Th>Status</Th>
                  <Th className="hidden md:table-cell">Billing</Th>
                  <Th className="hidden sm:table-cell">Next invoice</Th>
                  <Th right>Per period</Th>
                  <Th right className="hidden lg:table-cell">MRR</Th>
                </>
              }
            >
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => openContract(c.id)}>
                  <Td>
                    <div className="font-semibold text-slate-800">{c.name}</div>
                    <div className="text-[10px] text-slate-400">{c.number}</div>
                  </Td>
                  <Td>
                    <button className="hover:underline font-medium" onClick={(e) => { e.stopPropagation(); openClient(c.clientId); }}>
                      {c.clientName}
                    </button>
                  </Td>
                  <Td><StatusBadge status={c.status} /></Td>
                  <Td className="hidden md:table-cell text-slate-500">
                    {FREQ_LABEL[c.billingFrequency]} · day {c.billingDay} · {c.billInAdvance ? 'in advance' : 'in arrears'}
                  </Td>
                  <Td className="hidden sm:table-cell text-slate-500">{c.status === 'active' ? shortDate(c.nextInvoiceDate) : '—'}</Td>
                  <Td right className="font-semibold">{money(c.recurringAmount, cur)}</Td>
                  <Td right className="hidden lg:table-cell">{money(c.mrr, cur)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------

const OS_OPTIONS: { v: DeviceOS; l: string }[] = [
  { v: 'windows', l: 'Windows' },
  { v: 'macos', l: 'macOS' },
  { v: 'linux', l: 'Linux' },
  { v: 'network', l: 'Network' },
  { v: 'android', l: 'Android' },
  { v: 'ios', l: 'iOS' }
];

const blankContract = (clientId = '', terms: PaymentTerms = 'net_30'): Partial<Contract> => {
  const d = new Date();
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return {
    clientId,
    name: 'Managed Services Agreement',
    status: 'draft',
    startDate: today(),
    autoRenew: true,
    billingFrequency: 'monthly',
    billingDay: 1,
    billInAdvance: true,
    nextInvoiceDate: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`,
    paymentTerms: terms,
    requireReview: true,
    autoSend: true,
    lines: []
  };
};

const ContractEditor: React.FC<{ id: string }> = ({ id }) => {
  const { closeContract, contractPrefillClientId, billingClients, items, settings, bump, openDocument, openClient } = useBilling();
  const cur = settings?.currency || 'USD';
  const [c, setC] = useState<Partial<Contract> | null>(id === 'new' ? blankContract(contractPrefillClientId || '', settings?.defaultPaymentTerms) : null);
  const [preview, setPreview] = useState<ContractPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ m: string; t?: 'ok' | 'err' } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    if (id === 'new') return;
    try {
      const [cc, pv] = await Promise.all([billingApi.contract(id), billingApi.previewContract(id).catch(() => null)]);
      setC(cc);
      setPreview(pv);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  if (!c) return error ? <div className="p-6"><ErrorBanner error={error} /></div> : <Loading />;

  const set = <K extends keyof Contract>(k: K, v: Contract[K]) => setC((p) => (p ? { ...p, [k]: v } : p));
  const setLine = (lid: string, patch: Partial<ContractLine>) => setC((p) => (p ? { ...p, lines: (p.lines || []).map((l) => (l.id === lid ? { ...l, ...patch } : l)) } : p));
  const addLine = (it?: CatalogItem) => {
    const mode: ContractQuantityMode = it?.type === 'per_device' ? 'device_count' : it?.type === 'per_user' ? 'user_count' : 'fixed';
    setC((p) =>
      p
        ? {
            ...p,
            lines: [
              ...(p.lines || []),
              {
                id: newId('cl'),
                itemId: it?.id,
                name: it?.name || '',
                description: it?.description,
                quantityMode: mode,
                fixedQuantity: mode === 'fixed' ? 1 : undefined,
                deviceFilter: mode === 'device_count' ? { os: [], includeMdm: false } : undefined,
                unit: it?.unit,
                unitPrice: it?.unitPrice || 0,
                taxable: it?.taxable ?? true
              }
            ]
          }
        : p
    );
  };

  const save = async (extra?: Partial<Contract>) => {
    setError(null);
    const body = { ...c, ...extra };
    if (!body.clientId) return setError('Choose a client.');
    if (!body.name?.trim()) return setError('Give the contract a name.');
    if (!(body.lines || []).length) return setError('Add at least one billing line.');
    if ((body.lines || []).some((l) => !l.name.trim())) return setError('Every line needs a name.');
    setSaving(true);
    try {
      const saved = c.id ? await billingApi.updateContract(c.id, body) : await billingApi.createContract(body);
      bump();
      setC(saved);
      setPreview(await billingApi.previewContract(saved.id).catch(() => null));
      setToast({ m: 'Contract saved' });
      return saved;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const generate = async () => {
    const saved = await save();
    if (!saved) return;
    try {
      const inv = await billingApi.generateInvoice(saved.id);
      bump();
      openDocument(inv.id, 'invoice');
    } catch (e) {
      setToast({ m: (e as Error).message, t: 'err' });
    }
  };

  const client = billingClients.find((x) => x.id === c.clientId);

  return (
    <>
      <PageHeader
        Icon={ScrollText}
        tint="#10b981"
        title={c.id ? `${c.name} (${c.number})` : 'New contract'}
        subtitle={client ? client.name : 'Choose a client'}
        onBack={closeContract}
      >
        {c.status && <StatusBadge status={c.status} className="mr-1" />}
        {c.id && c.status === 'active' && (
          <button className={btn.secondary} onClick={() => save({ status: 'paused' })} disabled={saving}>
            <Pause className="w-3.5 h-3.5" /> Pause
          </button>
        )}
        {c.id && (c.status === 'paused' || c.status === 'draft') && (
          <button className={btn.success} onClick={() => save({ status: 'active' })} disabled={saving}>
            <Play className="w-3.5 h-3.5" /> Activate
          </button>
        )}
        {c.id && (
          <button className={btn.secondary} onClick={generate} disabled={saving} title="Create this period's invoice now">
            <Zap className="w-3.5 h-3.5" /> Generate invoice now
          </button>
        )}
        <button className={btn.primary} onClick={() => save(c.id ? undefined : { status: 'active' })} disabled={saving}>
          <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : c.id ? 'Save' : 'Save & activate'}
        </button>
      </PageHeader>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-6 pb-24 md:pb-6">
        <div className="max-w-6xl mx-auto space-y-4">
          <ErrorBanner error={error} />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card title="Agreement" className="lg:col-span-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Client *">
                  <select className={input} value={c.clientId} onChange={(e) => set('clientId', e.target.value)} disabled={!!c.id}>
                    <option value="">Select a client…</option>
                    {billingClients.map((x) => (
                      <option key={x.id} value={x.id}>{x.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Contract name *">
                  <input className={input} value={c.name || ''} onChange={(e) => set('name', e.target.value)} />
                </Field>
                <Field label="Start date">
                  <input className={input} type="date" value={c.startDate || ''} onChange={(e) => set('startDate', e.target.value)} />
                </Field>
                <Field label="End date" hint="Leave empty for month-to-month / evergreen">
                  <input className={input} type="date" value={c.endDate || ''} onChange={(e) => set('endDate', e.target.value || undefined)} />
                </Field>
                <Field label="SLA tier">
                  <select className={input} value={c.slaTier || ''} onChange={(e) => set('slaTier', (e.target.value || undefined) as Contract['slaTier'])}>
                    <option value="">—</option>
                    <option>Gold 24/7</option>
                    <option>Silver 8/5</option>
                    <option>Bronze Best Effort</option>
                  </select>
                </Field>
                <Field label="Auto-renew">
                  <label className="flex items-center gap-2 text-xs py-1.5">
                    <input type="checkbox" checked={!!c.autoRenew} onChange={(e) => set('autoRenew', e.target.checked)} /> Renew automatically at end date
                  </label>
                </Field>
              </div>
            </Card>

            <Card title="Billing schedule">
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Frequency">
                    <select className={input} value={c.billingFrequency} onChange={(e) => set('billingFrequency', e.target.value as BillingFrequency)}>
                      {(Object.keys(FREQ_LABEL) as BillingFrequency[]).map((f) => (
                        <option key={f} value={f}>{FREQ_LABEL[f]}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Billing day">
                    <input className={input} type="number" min={1} max={28} value={c.billingDay || 1} onChange={(e) => set('billingDay', Math.min(28, Math.max(1, Number(e.target.value) || 1)))} />
                  </Field>
                </div>
                <Field label="Next invoice date">
                  <input className={input} type="date" value={c.nextInvoiceDate || ''} onChange={(e) => set('nextInvoiceDate', e.target.value)} />
                </Field>
                <Field label="Bill">
                  <select className={input} value={c.billInAdvance ? 'adv' : 'arr'} onChange={(e) => set('billInAdvance', e.target.value === 'adv')}>
                    <option value="adv">In advance (upcoming period)</option>
                    <option value="arr">In arrears (past period)</option>
                  </select>
                </Field>
                <Field label="Payment terms">
                  <select className={input} value={c.paymentTerms} onChange={(e) => set('paymentTerms', e.target.value as PaymentTerms)}>
                    {(Object.keys(TERMS_LABEL) as PaymentTerms[]).map((t) => (
                      <option key={t} value={t}>{TERMS_LABEL[t]}</option>
                    ))}
                  </select>
                </Field>
                <label className="flex items-start gap-2 text-xs">
                  <input type="checkbox" className="mt-0.5" checked={!!c.requireReview} onChange={(e) => set('requireReview', e.target.checked)} />
                  <span>
                    <span className="font-semibold">Review before sending</span>
                    <span className="block text-[10px] text-slate-500">Generated invoices go to Invoice Audit first (recommended)</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-xs">
                  <input type="checkbox" className="mt-0.5" checked={!!c.autoSend} onChange={(e) => set('autoSend', e.target.checked)} />
                  <span>
                    <span className="font-semibold">Email automatically</span>
                    <span className="block text-[10px] text-slate-500">{c.requireReview ? 'Send as soon as it\'s approved' : 'Send as soon as it\'s generated'}</span>
                  </span>
                </label>
              </div>
            </Card>
          </div>

          <Card
            title="Recurring lines"
            padded={false}
            actions={
              <select
                className={`${input} w-56`}
                value=""
                onChange={(e) => {
                  const it = items.find((i) => i.id === e.target.value);
                  if (e.target.value === '__blank') addLine();
                  else if (it) addLine(it);
                }}
              >
                <option value="">+ Add line…</option>
                <option value="__blank">Custom line</option>
                {items.filter((i) => i.active).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({money(i.unitPrice, cur)}{i.unit ? `/${i.unit}` : ''})
                  </option>
                ))}
              </select>
            }
          >
            {(c.lines || []).length === 0 ? (
              <div className="text-xs text-slate-500 text-center py-8">Add flat fees (e.g. firewall management), per-device lines (counted live from RMM/MDM) or per-user lines.</div>
            ) : (
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-xs min-w-[820px]">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                    <tr>
                      <th className="text-left px-3 py-2">Line</th>
                      <th className="text-left px-3 py-2 w-56">Quantity</th>
                      <th className="text-right px-3 py-2 w-28">Rate</th>
                      <th className="text-center px-3 py-2 w-16">Tax</th>
                      <th className="text-right px-3 py-2 w-28">Now</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(c.lines || []).map((l) => {
                      const pl = preview?.lines.find((x) => x.id === l.id);
                      return (
                        <tr key={l.id} className="align-top">
                          <td className="px-3 py-2">
                            <input className={`${input} font-semibold`} value={l.name} onChange={(e) => setLine(l.id, { name: e.target.value })} placeholder="Line name" />
                            <input className={`${input} mt-1 text-[11px]`} value={l.description || ''} onChange={(e) => setLine(l.id, { description: e.target.value })} placeholder="Description (optional)" />
                          </td>
                          <td className="px-3 py-2 space-y-1">
                            <select
                              className={input}
                              value={l.quantityMode}
                              onChange={(e) => {
                                const m = e.target.value as ContractQuantityMode;
                                setLine(l.id, { quantityMode: m, fixedQuantity: m === 'fixed' ? l.fixedQuantity || 1 : undefined, deviceFilter: m === 'device_count' ? l.deviceFilter || { os: [] } : undefined });
                              }}
                            >
                              <option value="fixed">Fixed quantity</option>
                              <option value="device_count">Per device (live count)</option>
                              <option value="user_count">Per user (client seats)</option>
                            </select>
                            {l.quantityMode === 'fixed' && (
                              <input className={input} type="number" min="0" step="0.01" value={l.fixedQuantity ?? 1} onChange={(e) => setLine(l.id, { fixedQuantity: Number(e.target.value) })} />
                            )}
                            {l.quantityMode === 'device_count' && (
                              <div className="space-y-1">
                                <div className="flex flex-wrap gap-1">
                                  {OS_OPTIONS.map((o) => {
                                    const on = l.deviceFilter?.os?.includes(o.v);
                                    return (
                                      <button
                                        key={o.v}
                                        type="button"
                                        onClick={() => {
                                          const os = new Set(l.deviceFilter?.os || []);
                                          if (on) os.delete(o.v);
                                          else os.add(o.v);
                                          setLine(l.id, { deviceFilter: { ...l.deviceFilter, os: Array.from(os) } });
                                        }}
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${on ? 'bg-violet-50 border-violet-300 text-violet-700' : 'border-slate-200 text-slate-500'}`}
                                      >
                                        {o.l}
                                      </button>
                                    );
                                  })}
                                </div>
                                <div className="text-[10px] text-slate-400">{l.deviceFilter?.os?.length ? '' : 'No OS selected = all devices'}</div>
                                <label className="flex items-center gap-1.5 text-[11px]">
                                  <input type="checkbox" checked={!!l.deviceFilter?.includeMdm} onChange={(e) => setLine(l.id, { deviceFilter: { ...l.deviceFilter, includeMdm: e.target.checked } })} /> Include MDM tablets
                                </label>
                                <label className="flex items-center gap-1.5 text-[11px]">
                                  <input type="checkbox" checked={!!l.deviceFilter?.includeInactive} onChange={(e) => setLine(l.id, { deviceFilter: { ...l.deviceFilter, includeInactive: e.target.checked } })} /> Include offline devices
                                </label>
                              </div>
                            )}
                            {l.quantityMode !== 'fixed' && <div className="text-[10px] font-semibold text-slate-500 pt-1">Minimum billed (optional)</div>}
                            {l.quantityMode !== 'fixed' && (
                              <input className={input} type="number" min="0" placeholder="e.g. 5" value={l.minimumQuantity ?? ''} onChange={(e) => setLine(l.id, { minimumQuantity: e.target.value === '' ? undefined : Number(e.target.value) })} />
                            )}
                            {l.quantityMode === 'user_count' && (
                              <div className="text-[10px] text-slate-500">Uses the client's billable users ({client?.billableUsers ?? 0}) — edit on the client profile.</div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <input className={`${input} text-right`} type="number" step="0.01" value={l.unitPrice} onChange={(e) => setLine(l.id, { unitPrice: Number(e.target.value) })} />
                          </td>
                          <td className="px-3 py-2 text-center pt-3.5">
                            <input type="checkbox" checked={l.taxable} onChange={(e) => setLine(l.id, { taxable: e.target.checked })} aria-label="Taxable" />
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums pt-3.5">
                            {pl ? (
                              <>
                                <div className="font-semibold">{money(pl.currentAmount, cur)}</div>
                                <div className="text-[10px] text-slate-400">qty {pl.currentQuantity}</div>
                              </>
                            ) : (
                              <span className="text-slate-300">save to preview</span>
                            )}
                          </td>
                          <td className="px-1 py-2 pt-3">
                            <button className="text-slate-300 hover:text-rose-500" onClick={() => setC((p) => (p ? { ...p, lines: (p.lines || []).filter((x) => x.id !== l.id) } : p))} aria-label="Remove line">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {preview && (
              <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 px-4 py-3 border-t border-slate-100 text-xs">
                <span className="text-slate-500">
                  Next period {shortDate(preview.periodStart)} – {shortDate(preview.periodEnd)}
                </span>
                <span>Subtotal <b className="tabular-nums">{money(preview.subtotal, cur)}</b></span>
                <span>Tax <b className="tabular-nums">{money(preview.taxTotal, cur)}</b></span>
                <span>Total <b className="tabular-nums">{money(preview.total, cur)}</b></span>
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Included hours & overage (optional)">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Included hours / period">
                  <input className={input} type="number" min="0" step="0.5" value={c.includedHoursPerPeriod ?? ''} onChange={(e) => set('includedHoursPerPeriod', e.target.value === '' ? undefined : Number(e.target.value))} />
                </Field>
                <Field label="Overage rate / hr">
                  <input className={input} type="number" min="0" step="1" value={c.overageHourlyRate ?? ''} onChange={(e) => set('overageHourlyRate', e.target.value === '' ? undefined : Number(e.target.value))} />
                </Field>
              </div>
              <p className="text-[10px] text-slate-500 mt-2">Billable ticket time beyond the included hours is added to the contract invoice at the overage rate.</p>
            </Card>
            <Card title="Internal notes">
              <textarea className={input} rows={4} value={c.notes || ''} onChange={(e) => set('notes', e.target.value)} />
              {c.id && (
                <div className="flex items-center justify-between mt-3 text-[11px] text-slate-500">
                  <span>
                    {c.lastInvoiceId ? (
                      <button className="text-violet-700 hover:underline" onClick={() => openDocument(c.lastInvoiceId!, 'invoice')}>
                        Last invoiced {shortDate(c.lastInvoicedAt)}
                      </button>
                    ) : (
                      'Not invoiced yet'
                    )}
                    {' · '}
                    <button className="text-violet-700 hover:underline" onClick={() => openClient(c.clientId!)}>Client 360</button>
                  </span>
                  <button className={btn.danger} onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
      {confirmDelete && c.id && (
        <Modal
          title="Delete contract?"
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <button className={btn.secondary} onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button className={btn.secondary} onClick={async () => { await save({ status: 'cancelled' }); setConfirmDelete(false); }}>Cancel contract instead</button>
              <button
                className={btn.danger}
                onClick={async () => {
                  try {
                    await billingApi.deleteContract(c.id!);
                    bump();
                    closeContract();
                  } catch (e) {
                    setConfirmDelete(false);
                    setToast({ m: (e as Error).message, t: 'err' });
                  }
                }}
              >
                Delete
              </button>
            </>
          }
        >
          <p className="text-xs text-slate-600">Invoices already generated stay. Cancelling keeps the contract for history and stops future invoices — usually the better choice.</p>
        </Modal>
      )}
      <Toast message={toast?.m || null} tone={toast?.t} onDone={() => setToast(null)} />
    </>
  );
};

export default ContractsView;
