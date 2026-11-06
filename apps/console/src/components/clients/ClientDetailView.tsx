import React, { useCallback, useEffect, useState } from 'react';
import { Store, Pencil, FilePlus2, FileText, FileSignature, CreditCard, Archive, RefreshCw } from 'lucide-react';
import type { ClientOverview } from '@openmsp/api-types';
import { clientsApi } from '../../services/billingApi';
import { useBilling } from '../../data/BillingContext';
import { PageHeader, StatusBadge, Stat, Tabs, Loading, ErrorBanner, Modal, Toast, btn } from '../billing/ui';
import { money } from '../billing/format';
import { RecordPaymentModal } from '../billing/RecordPaymentModal';
import { ClientFormModal } from './ClientFormModal';
import {
  type ClientTab,
  type BillingSection,
  OPEN_TICKET,
  OPEN_INCIDENT,
  OverviewTab,
  AssetsTab,
  VaultTab,
  TicketsTab,
  BillingTab,
  SecurityTab,
  NotesTab
} from './ClientTabs';

/**
 * ClientDetailView — the Client 360°: financials, contracts, documents,
 * assets, vault, tickets/time and security for one client, with deep links
 * into every other module.
 */
export const ClientDetailView: React.FC<{ id: string }> = ({ id }) => {
  const { closeClient, newDocument, openContract, openDocument, version, bump, refreshClients, billingClients } = useBilling();
  const [data, setData] = useState<ClientOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ClientTab>('overview');
  const [billingSection, setBillingSection] = useState<{ s: BillingSection; k: number }>({ s: 'invoice', k: 0 });
  const [showEdit, setShowEdit] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await clientsApi.overview(id));
    } catch (e) {
      setError((e as Error).message || 'Failed to load client');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load, version]);

  useEffect(() => {
    setTab('overview');
  }, [id]);

  const goBillingSection = (s: BillingSection) => {
    setBillingSection((b) => ({ s, k: b.k + 1 }));
    setTab('billing');
  };

  const archive = async () => {
    setArchiving(true);
    try {
      await clientsApi.archive(id);
      await refreshClients();
      bump();
      setConfirmArchive(false);
      closeClient();
    } catch (e) {
      setToast({ msg: (e as Error).message || 'Archive failed', tone: 'err' });
    } finally {
      setArchiving(false);
    }
  };

  const invoiceTime = async (ids: string[]) => {
    try {
      const doc = await clientsApi.invoiceUnbilledTime(id, ids);
      bump();
      openDocument(doc.id, 'invoice');
    } catch (e) {
      setToast({ msg: (e as Error).message || 'Could not create invoice', tone: 'err' });
    }
  };

  const clearToast = useCallback(() => setToast(null), []);
  const fallbackName = billingClients.find((c) => c.id === id)?.name;

  if (!data) {
    return (
      <div className="flex flex-col h-full min-h-0 bg-[#f4f6f8]">
        <PageHeader Icon={Store} tint="#f59e0b" title={fallbackName || 'Client'} onBack={closeClient} />
        <div className="p-4 sm:p-6 space-y-4">
          {loading ? <Loading label="Loading client…" /> : <ErrorBanner error={error || 'Client not found'} onRetry={() => void load()} />}
        </div>
      </div>
    );
  }

  const { client, financial: f } = data;
  const openTickets = data.tickets.filter(OPEN_TICKET).length;
  const openIncidents = data.incidents.filter(OPEN_INCIDENT);
  const highIncidents = openIncidents.filter((i) => i.severity === 'critical' || i.severity === 'high').length;
  const subtitle = [client.domain, client.sites?.length ? `${client.sites.length} site${client.sites.length === 1 ? '' : 's'}` : null, client.monthlySlaTier, client.industry]
    .filter(Boolean)
    .join(' · ');

  const tabs: { key: ClientTab; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'assets', label: 'Assets', count: data.devices.length + data.mdmDevices.length },
    { key: 'vault', label: 'Vault', count: data.vaultItems.length },
    { key: 'tickets', label: 'Tickets & Time', count: openTickets },
    { key: 'billing', label: 'Billing', count: data.documents.length },
    { key: 'security', label: 'Security', count: openIncidents.length },
    { key: 'notes', label: 'Notes & Contacts' }
  ];

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#f4f6f8]">
      <PageHeader Icon={Store} tint="#f59e0b" title={client.name} subtitle={subtitle || undefined} onBack={closeClient}>
        <StatusBadge status={client.status || 'active'} className="mr-1" />
        <button className={btn.secondary} onClick={() => void load()} title="Refresh">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button className={btn.secondary} onClick={() => setShowEdit(true)}>
          <Pencil className="w-3.5 h-3.5" /> Edit
        </button>
        <button className={btn.secondary} onClick={() => newDocument('quote', { clientId: id })}>
          <FileText className="w-3.5 h-3.5" /> <span className="hidden sm:inline">New</span> Quote
        </button>
        <button className={btn.secondary} onClick={() => openContract('new', id)}>
          <FileSignature className="w-3.5 h-3.5" /> <span className="hidden sm:inline">New</span> Contract
        </button>
        <button className={btn.secondary} onClick={() => setShowPayment(true)}>
          <CreditCard className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Record</span> Payment
        </button>
        <button className={btn.primary} onClick={() => newDocument('invoice', { clientId: id })}>
          <FilePlus2 className="w-3.5 h-3.5" /> New Invoice
        </button>
        <button className={btn.danger} onClick={() => setConfirmArchive(true)} title="Archive client">
          <Archive className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Archive</span>
        </button>
      </PageHeader>

      <Tabs tabs={tabs} active={tab} onChange={(k) => setTab(k as ClientTab)} />

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 space-y-4">
        <ErrorBanner error={error} onRetry={() => void load()} />

        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
          <Stat label="Outstanding" value={money(f.outstanding)} tone={f.outstanding > 0 ? 'warn' : 'default'} onClick={() => goBillingSection('invoice')} />
          <Stat label="Overdue" value={money(f.overdue)} tone={f.overdue > 0 ? 'bad' : 'good'} onClick={() => goBillingSection('invoice')} />
          <Stat label="Credit balance" value={money(f.creditBalance)} tone={f.creditBalance > 0 ? 'good' : 'default'} onClick={() => goBillingSection('payments')} />
          <Stat label="MRR" value={money(f.mrr)} tone="good" sub={`${data.contracts.filter((c) => c.status === 'active').length} active contracts`} onClick={() => goBillingSection('contracts')} />
          <Stat
            label="Unbilled time"
            value={money(f.unbilledTimeAmount)}
            tone={f.unbilledTimeAmount > 0 ? 'warn' : 'default'}
            sub={`${(f.unbilledTimeMinutes / 60).toFixed(1)} hours`}
            onClick={() => setTab('tickets')}
          />
          <Stat label="Devices" value={data.devices.length} sub={data.mdmDevices.length ? `+${data.mdmDevices.length} MDM` : undefined} onClick={() => setTab('assets')} />
          <Stat label="Open tickets" value={openTickets} tone={openTickets > 0 ? 'warn' : 'default'} onClick={() => setTab('tickets')} />
          <Stat
            label="Security incidents"
            value={openIncidents.length}
            tone={highIncidents > 0 ? 'bad' : openIncidents.length > 0 ? 'warn' : 'good'}
            sub={highIncidents ? `${highIncidents} high/critical` : 'open'}
            onClick={() => setTab('security')}
          />
        </div>

        {tab === 'overview' && <OverviewTab data={data} go={setTab} onEdit={() => setShowEdit(true)} />}
        {tab === 'assets' && <AssetsTab data={data} go={setTab} />}
        {tab === 'vault' && <VaultTab data={data} go={setTab} />}
        {tab === 'tickets' && <TicketsTab key={data.unbilledTime.length} data={data} go={setTab} onInvoiceTime={invoiceTime} />}
        {tab === 'billing' && (
          <BillingTab key={billingSection.k} data={data} go={setTab} initialSection={billingSection.s} onRecordPayment={() => setShowPayment(true)} />
        )}
        {tab === 'security' && <SecurityTab data={data} go={setTab} />}
        {tab === 'notes' && <NotesTab data={data} go={setTab} onEdit={() => setShowEdit(true)} />}
      </div>

      {showEdit && (
        <ClientFormModal
          client={client}
          onClose={() => setShowEdit(false)}
          onSaved={() => setToast({ msg: 'Client saved', tone: 'ok' })}
        />
      )}

      {showPayment && (
        <RecordPaymentModal
          clientId={id}
          onClose={() => setShowPayment(false)}
          onSaved={() => {
            setShowPayment(false);
            bump();
            setToast({ msg: 'Payment recorded', tone: 'ok' });
          }}
        />
      )}

      {confirmArchive && (
        <Modal
          title="Archive client?"
          onClose={() => setConfirmArchive(false)}
          width="max-w-md"
          footer={
            <>
              <button className={btn.secondary} onClick={() => setConfirmArchive(false)} disabled={archiving}>
                Cancel
              </button>
              <button className={btn.danger} onClick={archive} disabled={archiving}>
                <Archive className="w-3.5 h-3.5" /> {archiving ? 'Archiving…' : 'Archive client'}
              </button>
            </>
          }
        >
          <p className="text-xs text-slate-600">
            <strong className="text-slate-800">{client.name}</strong> will be marked inactive and hidden from active lists. Invoices, payments and history are kept.
          </p>
          {(f.outstanding > 0 || data.contracts.some((c) => c.status === 'active')) && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
              This client has {f.outstanding > 0 ? `${money(f.outstanding)} outstanding` : ''}
              {f.outstanding > 0 && data.contracts.some((c) => c.status === 'active') ? ' and ' : ''}
              {data.contracts.some((c) => c.status === 'active') ? 'active contracts that will keep billing' : ''}.
            </p>
          )}
        </Modal>
      )}

      <Toast message={toast?.msg || null} tone={toast?.tone} onDone={clearToast} />
    </div>
  );
};

export default ClientDetailView;
