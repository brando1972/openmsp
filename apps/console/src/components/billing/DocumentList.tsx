import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { BillingDocType, BillingDocument } from '@openmsp/api-types';
import { FileText, Package, Receipt, FileMinus, Plus, Search, RefreshCw, type LucideIcon } from 'lucide-react';
import { billingApi } from '../../services/billingApi';
import { useBilling } from '../../data/BillingContext';
import { PageHeader, StatusBadge, EmptyState, Loading, ErrorBanner, Table, Th, Td, btn, input, Stat } from './ui';
import { DOC_LABEL, money, shortDate } from './format';

const META: Record<BillingDocType, { Icon: LucideIcon; tint: string; statuses: string[]; blurb: string }> = {
  quote: { Icon: FileText, tint: '#a855f7', statuses: ['draft', 'sent', 'accepted', 'declined', 'expired', 'converted'], blurb: 'Send estimates; accepted quotes convert to sales orders or invoices.' },
  sales_order: { Icon: Package, tint: '#d946ef', statuses: ['draft', 'confirmed', 'invoiced', 'void'], blurb: 'Confirmed work or hardware orders waiting to be invoiced.' },
  invoice: { Icon: Receipt, tint: '#22c55e', statuses: ['draft', 'pending_review', 'sent', 'partially_paid', 'overdue', 'paid', 'void'], blurb: 'One-off and contract invoices. Clients can pay online.' },
  credit_note: { Icon: FileMinus, tint: '#f97316', statuses: ['open', 'applied', 'void'], blurb: 'Credits you owe clients; apply them to open invoices.' }
};

/** DocumentList — searchable, filterable list for quotes, sales orders, invoices and credit notes. */
export const DocumentList: React.FC<{ type: BillingDocType }> = ({ type }) => {
  const { newDocument, openDocument, openClient, version, settings } = useBilling();
  const cur = settings?.currency || 'USD';
  const meta = META[type];
  const label = DOC_LABEL[type];
  const [docs, setDocs] = useState<BillingDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>('all');

  const load = useCallback(async () => {
    setError(null);
    try {
      setDocs(await billingApi.documents({ type }));
    } catch (e) {
      setError((e as Error).message);
      setDocs([]);
    }
  }, [type]);

  useEffect(() => {
    setDocs(null);
    setStatus('all');
    void load();
  }, [load, version]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (docs || [])
      .filter((d) => status === 'all' || d.status === status || (status === 'unpaid' && ['sent', 'partially_paid', 'overdue'].includes(d.status)))
      .filter((d) => !s || d.number.toLowerCase().includes(s) || d.clientName.toLowerCase().includes(s) || (d.reference || '').toLowerCase().includes(s) || (d.subject || '').toLowerCase().includes(s))
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.number.localeCompare(a.number));
  }, [docs, q, status]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    (docs || []).forEach((d) => (c[d.status] = (c[d.status] || 0) + 1));
    return c;
  }, [docs]);

  const kpis = useMemo(() => {
    const all = docs || [];
    if (type === 'invoice') {
      const open = all.filter((d) => ['sent', 'partially_paid', 'overdue'].includes(d.status));
      return [
        { label: 'Outstanding', value: money(open.reduce((s, d) => s + d.balanceDue, 0), cur), tone: 'default' as const, f: 'unpaid' },
        { label: 'Overdue', value: money(all.filter((d) => d.status === 'overdue').reduce((s, d) => s + d.balanceDue, 0), cur), tone: 'bad' as const, f: 'overdue' },
        { label: 'Needs review', value: counts.pending_review || 0, tone: 'warn' as const, f: 'pending_review' },
        { label: 'Drafts', value: counts.draft || 0, tone: 'default' as const, f: 'draft' }
      ];
    }
    if (type === 'quote') {
      const open = all.filter((d) => d.status === 'sent');
      return [
        { label: 'Awaiting response', value: money(open.reduce((s, d) => s + d.total, 0), cur), tone: 'default' as const, f: 'sent' },
        { label: 'Accepted', value: counts.accepted || 0, tone: 'good' as const, f: 'accepted' },
        { label: 'Drafts', value: counts.draft || 0, tone: 'default' as const, f: 'draft' }
      ];
    }
    if (type === 'credit_note') {
      return [{ label: 'Open credit', value: money(all.filter((d) => d.status === 'open').reduce((s, d) => s + d.balanceDue, 0), cur), tone: 'default' as const, f: 'open' }];
    }
    return [
      { label: 'Confirmed, not invoiced', value: money(all.filter((d) => d.status === 'confirmed').reduce((s, d) => s + d.total, 0), cur), tone: 'default' as const, f: 'confirmed' },
      { label: 'Drafts', value: counts.draft || 0, tone: 'default' as const, f: 'draft' }
    ];
  }, [docs, counts, type, cur]);

  return (
    <>
      <PageHeader Icon={meta.Icon} tint={meta.tint} title={label.many} count={docs?.length} subtitle={meta.blurb}>
        <button className={btn.secondary} onClick={() => load()} title="Refresh">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <button className={btn.primary} onClick={() => newDocument(type)}>
          <Plus className="w-3.5 h-3.5" /> New {label.one}
        </button>
      </PageHeader>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-6 pb-20 md:pb-6 space-y-4">
        <ErrorBanner error={error} onRetry={load} />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpis.map((k) => (
            <Stat key={k.label} label={k.label} value={k.value} tone={k.tone} onClick={() => setStatus(k.f)} />
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 p-3 border-b border-slate-100">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input className={`${input} pl-8`} placeholder={`Search ${label.many.toLowerCase()}, clients, PO…`} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-1">
              {['all', ...(type === 'invoice' ? ['unpaid'] : []), ...meta.statuses].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`px-2 py-1 rounded-md text-[11px] font-semibold border transition ${
                    status === s ? 'bg-violet-50 border-violet-300 text-violet-700' : 'bg-white border-slate-200 text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {s === 'all' ? 'All' : s === 'unpaid' ? 'Unpaid' : s === 'pending_review' ? 'Needs review' : s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  {s !== 'all' && s !== 'unpaid' && counts[s] ? <span className="ml-1 text-slate-400">{counts[s]}</span> : null}
                </button>
              ))}
            </div>
          </div>

          {!docs ? (
            <Loading />
          ) : filtered.length === 0 ? (
            <EmptyState
              Icon={meta.Icon}
              title={docs.length === 0 ? `No ${label.many.toLowerCase()} yet` : 'Nothing matches these filters'}
              body={docs.length === 0 ? meta.blurb : 'Try a different status or search.'}
              action={
                docs.length === 0 ? (
                  <button className={btn.primary} onClick={() => newDocument(type)}>
                    <Plus className="w-3.5 h-3.5" /> New {label.one}
                  </button>
                ) : undefined
              }
            />
          ) : (
            <Table
              head={
                <>
                  <Th>Date</Th>
                  <Th>Number</Th>
                  <Th>Client</Th>
                  <Th className="hidden md:table-cell">Reference</Th>
                  <Th>Status</Th>
                  {type === 'invoice' && <Th className="hidden sm:table-cell">Due</Th>}
                  {type === 'quote' && <Th className="hidden sm:table-cell">Expires</Th>}
                  <Th right>Total</Th>
                  {(type === 'invoice' || type === 'credit_note') && <Th right>{type === 'invoice' ? 'Balance' : 'Remaining'}</Th>}
                </>
              }
            >
              {filtered.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => openDocument(d.id)}>
                  <Td className="text-slate-500 whitespace-nowrap">{shortDate(d.issueDate)}</Td>
                  <Td className="font-semibold text-violet-700 whitespace-nowrap">
                    {d.number}
                    {d.contractId && <span className="ml-1.5 text-[9px] font-bold text-emerald-700 bg-emerald-50 rounded px-1">RECURRING</span>}
                    {(d.auditFlags?.length || 0) > 0 && d.status === 'pending_review' && (
                      <span className="ml-1 text-[9px] font-bold text-amber-700 bg-amber-50 rounded px-1">{d.auditFlags!.length} FLAG{d.auditFlags!.length > 1 ? 'S' : ''}</span>
                    )}
                  </Td>
                  <Td>
                    <button
                      className="hover:underline text-slate-800 font-medium text-left"
                      onClick={(e) => {
                        e.stopPropagation();
                        openClient(d.clientId);
                      }}
                    >
                      {d.clientName}
                    </button>
                  </Td>
                  <Td className="hidden md:table-cell text-slate-500">{d.reference || d.subject || '—'}</Td>
                  <Td>
                    <StatusBadge status={d.status} />
                  </Td>
                  {type === 'invoice' && <Td className={`hidden sm:table-cell whitespace-nowrap ${d.status === 'overdue' ? 'text-rose-600 font-semibold' : 'text-slate-500'}`}>{shortDate(d.dueDate)}</Td>}
                  {type === 'quote' && <Td className="hidden sm:table-cell text-slate-500 whitespace-nowrap">{shortDate(d.expiryDate)}</Td>}
                  <Td right className="font-semibold">{money(d.total, cur)}</Td>
                  {(type === 'invoice' || type === 'credit_note') && (
                    <Td right className={d.balanceDue > 0 ? 'font-semibold' : 'text-slate-400'}>
                      {money(d.balanceDue, cur)}
                    </Td>
                  )}
                </tr>
              ))}
            </Table>
          )}
        </div>
      </div>
    </>
  );
};

export default DocumentList;
