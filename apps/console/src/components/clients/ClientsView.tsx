import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Store, Plus, Search, ArrowUpDown, ArrowUp, ArrowDown, RefreshCw } from 'lucide-react';
import type { ClientFinancialSummary, ClientStatus, ClientTenant } from '@openmsp/api-types';
import { clientsApi } from '../../services/billingApi';
import { useBilling } from '../../data/BillingContext';
import { PageHeader, StatusBadge, Stat, Card, EmptyState, Loading, ErrorBanner, Table, Th, Td, btn, input } from '../billing/ui';
import { money, shortDate } from '../billing/format';
import { ClientFormModal } from './ClientFormModal';
import { ClientDetailView } from './ClientDetailView';

/**
 * ClientsView — client list with financial roll-up. Renders the Client 360°
 * detail when a client is selected via BillingContext.openClient().
 */

type SortKey = 'name' | 'outstanding' | 'mrr';
type StatusFilter = 'all' | ClientStatus;

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'prospect', label: 'Prospect' },
  { key: 'inactive', label: 'Inactive' }
];

const hours = (min: number) => `${(min / 60).toFixed(1)}h`;

export const ClientsView: React.FC = () => {
  const { clientDetailId } = useBilling();
  if (clientDetailId) return <ClientDetailView id={clientDetailId} />;
  return <ClientList />;
};

const ClientList: React.FC = () => {
  const { openClient, version } = useBilling();
  const [clients, setClients] = useState<ClientTenant[]>([]);
  const [fin, setFin] = useState<Record<string, ClientFinancialSummary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [finError, setFinError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFinError(null);
    const [c, f] = await Promise.allSettled([clientsApi.list(), clientsApi.financials()]);
    if (c.status === 'fulfilled') setClients(c.value);
    else setError(c.reason?.message || 'Failed to load clients');
    if (f.status === 'fulfilled') setFin(Object.fromEntries(f.value.map((x) => [x.clientId, x])));
    else setFinError(f.reason?.message || 'Failed to load financials');
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load, version]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: clients.length, active: 0, prospect: 0, inactive: 0 };
    clients.forEach((x) => (c[x.status || 'active'] = (c[x.status || 'active'] || 0) + 1));
    return c;
  }, [clients]);

  const totals = useMemo(() => {
    const t = { outstanding: 0, overdue: 0, overdueClients: 0, mrr: 0, unbilledAmt: 0, unbilledMin: 0 };
    Object.values(fin).forEach((f) => {
      t.outstanding += f.outstanding || 0;
      t.overdue += f.overdue || 0;
      if ((f.overdue || 0) > 0) t.overdueClients++;
      t.mrr += f.mrr || 0;
      t.unbilledAmt += f.unbilledTimeAmount || 0;
      t.unbilledMin += f.unbilledTimeMinutes || 0;
    });
    return t;
  }, [fin]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = clients.filter((c) => {
      if (filter !== 'all' && (c.status || 'active') !== filter) return false;
      if (!q) return true;
      return [c.name, c.domain, c.contactName, c.contactEmail, c.industry].some((v) => v?.toLowerCase().includes(q));
    });
    const val = (c: ClientTenant) =>
      sort.key === 'name' ? c.name.toLowerCase() : sort.key === 'mrr' ? fin[c.id]?.mrr || 0 : fin[c.id]?.outstanding || 0;
    return [...list].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });
  }, [clients, fin, search, filter, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'name' ? 1 : -1 }));

  const SortTh: React.FC<{ k: SortKey; label: string; right?: boolean; className?: string }> = ({ k, label, right, className }) => {
    const Icon = sort.key !== k ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
    return (
      <Th right={right} className={className}>
        <button onClick={() => toggleSort(k)} className={`inline-flex items-center gap-1 uppercase hover:text-slate-800 ${sort.key === k ? 'text-slate-800' : ''}`}>
          {label}
          <Icon className="w-3 h-3" />
        </button>
      </Th>
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#f4f6f8]">
      <PageHeader Icon={Store} tint="#f59e0b" title="Clients" count={clients.length} subtitle="Client accounts, billing profiles and 360° view">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input className={input + ' pl-8 w-44 sm:w-60'} placeholder="Search clients…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button className={btn.secondary} onClick={() => void load()} title="Refresh">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button className={btn.primary} onClick={() => setShowNew(true)}>
          <Plus className="w-3.5 h-3.5" /> New Client
        </button>
      </PageHeader>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 space-y-4">
        <ErrorBanner error={error} onRetry={() => void load()} />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Total outstanding" value={money(totals.outstanding)} sub={finError ? 'Financials unavailable' : `${Object.values(fin).filter((f) => f.outstanding > 0).length} clients with balance`} />
          <Stat label="Overdue" value={money(totals.overdue)} tone={totals.overdue > 0 ? 'bad' : 'good'} sub={`${totals.overdueClients} client${totals.overdueClients === 1 ? '' : 's'}`} />
          <Stat label="Total MRR" value={money(totals.mrr)} tone="good" sub="From active contracts" />
          <Stat label="Unbilled time" value={money(totals.unbilledAmt)} tone={totals.unbilledAmt > 0 ? 'warn' : 'default'} sub={hours(totals.unbilledMin)} />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${
                filter === f.key ? 'bg-[#090113] text-white border-[#090113]' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {f.label}
              <span className={`ml-1 tabular-nums ${filter === f.key ? 'text-white/70' : 'text-slate-400'}`}>{counts[f.key] || 0}</span>
            </button>
          ))}
          {finError && <span className="text-[11px] text-amber-600 ml-2">Financial data unavailable: {finError}</span>}
        </div>

        <Card padded={false}>
          {loading && clients.length === 0 ? (
            <Loading label="Loading clients…" />
          ) : clients.length === 0 && !error ? (
            <EmptyState
              Icon={Store}
              title="No clients yet"
              body="Add a client to start tracking contracts, invoices, devices and tickets in one place."
              action={
                <button className={btn.primary} onClick={() => setShowNew(true)}>
                  <Plus className="w-3.5 h-3.5" /> Add your first client
                </button>
              }
            />
          ) : rows.length === 0 ? (
            <EmptyState Icon={Search} title="No matching clients" body="Try a different search or status filter." />
          ) : (
            <Table
              head={
                <>
                  <SortTh k="name" label="Client" />
                  <Th>Status</Th>
                  <Th className="hidden lg:table-cell">Primary contact</Th>
                  <Th right className="hidden md:table-cell">Devices</Th>
                  <Th right className="hidden md:table-cell">Open tickets</Th>
                  <SortTh k="mrr" label="MRR" right className="hidden sm:table-cell" />
                  <SortTh k="outstanding" label="Outstanding" right />
                  <Th right className="hidden xl:table-cell">Credit</Th>
                  <Th className="hidden xl:table-cell">Last invoice</Th>
                </>
              }
            >
              {rows.map((c) => {
                const f = fin[c.id];
                return (
                  <tr key={c.id} onClick={() => openClient(c.id)} className="hover:bg-violet-50/40 cursor-pointer">
                    <Td>
                      <div className="font-semibold text-slate-800">{c.name}</div>
                      <div className="text-[11px] text-slate-400">{c.domain || c.industry || '—'}</div>
                    </Td>
                    <Td>
                      <StatusBadge status={c.status || 'active'} />
                    </Td>
                    <Td className="hidden lg:table-cell">
                      <div className="text-slate-700">{c.contactName || '—'}</div>
                      {c.contactEmail && <div className="text-[11px] text-slate-400">{c.contactEmail}</div>}
                    </Td>
                    <Td right className="hidden md:table-cell">
                      {c.totalDevices ?? 0}
                    </Td>
                    <Td right className="hidden md:table-cell">
                      <span className={c.openTickets > 0 ? 'text-slate-800 font-semibold' : 'text-slate-400'}>{c.openTickets ?? 0}</span>
                    </Td>
                    <Td right className="hidden sm:table-cell">
                      {f ? money(f.mrr) : '—'}
                    </Td>
                    <Td right>
                      {f ? (
                        <>
                          <div className={f.overdue > 0 ? 'text-rose-600 font-semibold' : 'text-slate-800'}>{money(f.outstanding)}</div>
                          {f.overdue > 0 && <div className="text-[10px] text-rose-500">{money(f.overdue)} overdue</div>}
                        </>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td right className="hidden xl:table-cell">
                      {f && f.creditBalance > 0 ? <span className="text-emerald-600">{money(f.creditBalance)}</span> : <span className="text-slate-400">—</span>}
                    </Td>
                    <Td className="hidden xl:table-cell text-slate-500">{shortDate(f?.lastInvoiceDate)}</Td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Card>
      </div>

      {showNew && <ClientFormModal onClose={() => setShowNew(false)} onSaved={(c) => openClient(c.id)} />}
    </div>
  );
};

export default ClientsView;
