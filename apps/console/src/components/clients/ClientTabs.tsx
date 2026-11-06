import React, { useMemo, useState } from 'react';
import {
  Users,
  Receipt,
  MapPin,
  FileText,
  Monitor,
  Ticket,
  KeyRound,
  ShieldAlert,
  StickyNote,
  ExternalLink,
  Plus,
  Wifi,
  Tablet,
  Clock,
  Printer,
  Star,
  Mail,
  Phone,
  Globe,
  Folder,
  CreditCard,
  Pencil
} from 'lucide-react';
import type {
  BillingDocType,
  BillingDocument,
  ClientOverview,
  DeviceHealth,
  DeviceOS,
  ManagedDevice,
  PSATicket,
  SecurityIncident
} from '@openmsp/api-types';
import { useApp } from '../../data/AppContext';
import { useBilling } from '../../data/BillingContext';
import { Card, EmptyState, StatusBadge, Table, Th, Td, btn } from '../billing/ui';
import { money, shortDate, dateTime, TERMS_LABEL, FREQ_LABEL, DOC_LABEL, METHOD_LABEL, statusLabel } from '../billing/format';

/** Tab bodies for the Client 360° view. Each receives the loaded overview. */

export type ClientTab = 'overview' | 'assets' | 'vault' | 'tickets' | 'billing' | 'security' | 'notes';

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------
export const OPEN_TICKET = (t: PSATicket) => t.status !== 'resolved' && t.status !== 'closed';
export const OPEN_INCIDENT = (i: SecurityIncident) => i.status !== 'resolved' && i.status !== 'false_positive';

export const OS_LABEL: Record<DeviceOS, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  network: 'Network',
  android: 'Android',
  ios: 'iOS'
};

const HEALTH_DOT: Record<DeviceHealth, string> = {
  healthy: 'bg-emerald-500',
  warning: 'bg-amber-500',
  critical: 'bg-rose-500',
  offline: 'bg-slate-300'
};

const PRIORITY_STYLE: Record<string, string> = {
  low: 'bg-slate-100 text-slate-600 border-slate-200',
  medium: 'bg-sky-50 text-sky-700 border-sky-200',
  high: 'bg-amber-50 text-amber-700 border-amber-200',
  urgent: 'bg-rose-50 text-rose-700 border-rose-200'
};

const SEVERITY_STYLE: Record<string, string> = {
  info: 'bg-slate-100 text-slate-600 border-slate-200',
  low: 'bg-sky-50 text-sky-700 border-sky-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  high: 'bg-orange-50 text-orange-700 border-orange-200',
  critical: 'bg-rose-50 text-rose-700 border-rose-200'
};

const Pill: React.FC<{ cls: string; children: React.ReactNode }> = ({ cls, children }) => (
  <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold whitespace-nowrap ${cls}`}>{children}</span>
);

const ViewAll: React.FC<{ onClick: () => void; label?: string }> = ({ onClick, label = 'View all' }) => (
  <button onClick={onClick} className="text-[11px] font-semibold text-violet-600 hover:text-violet-800">
    {label} →
  </button>
);

const CardTitle: React.FC<{ Icon: React.ElementType; children: React.ReactNode }> = ({ Icon, children }) => (
  <span className="inline-flex items-center gap-1.5">
    <Icon className="w-3.5 h-3.5 text-slate-400" />
    {children}
  </span>
);

const Muted: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="text-[11px] text-slate-400 py-2">{children}</div>;

const KV: React.FC<{ k: string; children: React.ReactNode }> = ({ k, children }) => (
  <div className="flex items-start justify-between gap-3 py-1">
    <span className="text-[11px] text-slate-500 shrink-0">{k}</span>
    <span className="text-xs text-slate-800 text-right min-w-0 break-words">{children}</span>
  </div>
);

const hours = (min: number) => `${(min / 60).toFixed(1)}h`;
const addressLines = (a?: ClientOverview['client']['billingAddress']): string[] =>
  a
    ? [a.line1, a.line2, [a.city, a.state].filter(Boolean).join(', ') + (a.postalCode ? ` ${a.postalCode}` : ''), a.country].filter(
        (x): x is string => !!x && !!x.trim()
      )
    : [];

/** Deep-link helpers into the other console modules. */
export const useDeepLinks = () => {
  const { setActiveTab, setActiveSubRailView, setSelectedDeviceId, setSelectedTicketId, setSelectedClientId } = useApp();
  return {
    device: (id: string) => {
      setSelectedDeviceId(id);
      setActiveTab('rmm');
    },
    ticket: (id: string) => {
      setSelectedTicketId(id);
      setActiveTab('psa-tickets');
    },
    vault: (clientId: string) => {
      setSelectedClientId(clientId);
      setActiveTab('vault');
    },
    incidents: () => {
      setActiveTab('security-soc');
      setActiveSubRailView('soc-incidents');
    },
    unifi: () => {
      setActiveTab('security-soc');
      setActiveSubRailView('soc-unifi');
    }
  };
};

interface TabProps {
  data: ClientOverview;
  go: (t: ClientTab) => void;
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
export const OverviewTab: React.FC<TabProps & { onEdit: () => void }> = ({ data, go, onEdit }) => {
  const { client, contracts, documents, devices, mdmDevices, tickets, vaultItems, incidents, unifiSites } = data;
  const { openContract, openDocument, taxRates } = useBilling();
  const link = useDeepLinks();

  const activeContracts = contracts.filter((c) => c.status === 'active' || c.status === 'paused');
  const invoices = documents
    .filter((d) => d.type === 'invoice')
    .sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''))
    .slice(0, 5);
  const openTickets = tickets.filter(OPEN_TICKET);
  const openIncidents = incidents.filter(OPEN_INCIDENT);
  const byOs = groupByOs(devices);
  const folders = Array.from(new Set(vaultItems.map((v) => v.folder || 'Unfiled')));
  const taxRate = taxRates.find((t) => t.id === client.taxRateId);
  const contacts = client.contacts || [];
  const addr = addressLines(client.billingAddress);
  const avgPatch = devices.length ? Math.round(devices.reduce((s, d) => s + (d.patchCompliance || 0), 0) / devices.length) : null;
  const encrypted = devices.filter((d) => d.encryptionStatus === 'encrypted').length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
      {/* Contacts */}
      <Card title={<CardTitle Icon={Users}>Contacts</CardTitle>} actions={<ViewAll onClick={() => go('notes')} label="Manage" />}>
        <div className="space-y-2.5">
          <ContactRow name={client.contactName} email={client.contactEmail} phone={client.contactPhone} primary />
          {contacts.slice(0, 3).map((c) => (
            <ContactRow key={c.id} name={c.name} title={c.title} email={c.email} phone={c.phone} primary={c.isPrimary} billing={c.isBilling} />
          ))}
          {contacts.length > 3 && <Muted>+{contacts.length - 3} more</Muted>}
          {client.website && (
            <a href={client.website.startsWith('http') ? client.website : `https://${client.website}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-violet-600 hover:underline">
              <Globe className="w-3 h-3" /> {client.website}
            </a>
          )}
        </div>
      </Card>

      {/* Billing profile */}
      <Card title={<CardTitle Icon={Receipt}>Billing profile</CardTitle>} actions={<button className={btn.ghost} onClick={onEdit}><Pencil className="w-3 h-3" /> Edit</button>}>
        <KV k="Billing email">{client.billingEmail || client.contactEmail || <span className="text-amber-600">Not set</span>}</KV>
        <KV k="Payment terms">{client.paymentTerms ? TERMS_LABEL[client.paymentTerms] : 'Org default'}</KV>
        <KV k="Tax">{client.taxExempt ? 'Tax exempt' : taxRate ? `${taxRate.name} (${taxRate.ratePct}%)` : 'Org default'}</KV>
        <KV k="Billable users">{client.billableUsers ?? '—'}</KV>
        <KV k="Address">{addr.length ? addr.map((l, i) => <div key={i}>{l}</div>) : '—'}</KV>
        {client.stripeCustomerId && <KV k="Stripe">{client.stripeCustomerId}</KV>}
      </Card>

      {/* Sites & SLA */}
      <Card title={<CardTitle Icon={MapPin}>Sites & SLA</CardTitle>}>
        <KV k="SLA tier">
          <span className="font-semibold">{client.monthlySlaTier || '—'}</span>
        </KV>
        <KV k="Industry">{client.industry || '—'}</KV>
        <KV k="Client since">{shortDate(client.createdAt)}</KV>
        <div className="mt-2">
          <div className="text-[11px] text-slate-500 mb-1">Sites ({client.sites?.length || 0})</div>
          {client.sites?.length ? (
            <div className="flex flex-wrap gap-1">
              {client.sites.map((s) => (
                <span key={s} className="px-1.5 py-0.5 rounded bg-slate-100 text-[11px] text-slate-700">
                  {s}
                </span>
              ))}
            </div>
          ) : (
            <Muted>No sites defined</Muted>
          )}
        </div>
      </Card>

      {/* Contracts */}
      <Card title={<CardTitle Icon={FileText}>Active contracts</CardTitle>} actions={<ViewAll onClick={() => go('billing')} />} padded={false}>
        {activeContracts.length === 0 ? (
          <div className="px-4">
            <Muted>No active contracts</Muted>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {activeContracts.map((c) => (
              <button key={c.id} onClick={() => openContract(c.id)} className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-800 truncate">{c.name}</div>
                  <div className="text-[11px] text-slate-500">
                    {FREQ_LABEL[c.billingFrequency]} · next {shortDate(c.nextInvoiceDate)}
                    {c.status !== 'active' && <> · <StatusBadge status={c.status} /></>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-semibold tabular-nums">{money(c.recurringAmount)}</div>
                  <div className="text-[10px] text-slate-400">{money(c.mrr)}/mo</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Recent invoices */}
      <Card title={<CardTitle Icon={Receipt}>Recent invoices</CardTitle>} actions={<ViewAll onClick={() => go('billing')} />} padded={false}>
        {invoices.length === 0 ? (
          <div className="px-4">
            <Muted>No invoices yet</Muted>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {invoices.map((d) => (
              <button key={d.id} onClick={() => openDocument(d.id, 'invoice')} className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-800">{d.number}</div>
                  <div className="text-[11px] text-slate-500">{shortDate(d.issueDate)}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={d.status} />
                  <div className="text-right">
                    <div className="text-xs tabular-nums">{money(d.total)}</div>
                    {d.balanceDue > 0 && <div className="text-[10px] text-rose-500 tabular-nums">{money(d.balanceDue)} due</div>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Assets */}
      <Card title={<CardTitle Icon={Monitor}>Assets</CardTitle>} actions={<ViewAll onClick={() => go('assets')} />}>
        {devices.length === 0 && mdmDevices.length === 0 && unifiSites.length === 0 ? (
          <Muted>No managed assets</Muted>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {byOs.map(([os, list]) => (
              <div key={os} className="rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2">
                <div className="text-[10px] text-slate-500">{OS_LABEL[os] || os}</div>
                <div className="text-base font-bold tabular-nums">{list.length}</div>
              </div>
            ))}
            {mdmDevices.length > 0 && (
              <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2">
                <div className="text-[10px] text-slate-500">MDM tablets</div>
                <div className="text-base font-bold tabular-nums">{mdmDevices.length}</div>
              </div>
            )}
            {unifiSites.length > 0 && (
              <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2">
                <div className="text-[10px] text-slate-500">UniFi sites</div>
                <div className="text-base font-bold tabular-nums">{unifiSites.length}</div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Open tickets */}
      <Card title={<CardTitle Icon={Ticket}>Open tickets ({openTickets.length})</CardTitle>} actions={<ViewAll onClick={() => go('tickets')} />} padded={false}>
        {openTickets.length === 0 ? (
          <div className="px-4">
            <Muted>No open tickets</Muted>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {openTickets.slice(0, 5).map((t) => (
              <button key={t.id} onClick={() => link.ticket(t.id)} className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-slate-800 truncate">
                    <span className="text-slate-400 mr-1">{t.ticketNumber}</span>
                    {t.title}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {statusLabel(t.status)} · {t.assignedTech || 'Unassigned'}
                  </div>
                </div>
                <Pill cls={PRIORITY_STYLE[t.priority] || PRIORITY_STYLE.low}>{statusLabel(t.priority)}</Pill>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Vault */}
      <Card title={<CardTitle Icon={KeyRound}>Vault</CardTitle>} actions={<ViewAll onClick={() => go('vault')} />}>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums">{vaultItems.length}</span>
          <span className="text-[11px] text-slate-500">credential{vaultItems.length === 1 ? '' : 's'} in {folders.length} folder{folders.length === 1 ? '' : 's'}</span>
        </div>
        {folders.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {folders.map((f) => (
              <span key={f} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-[11px] text-slate-700">
                <Folder className="w-3 h-3 text-slate-400" />
                {f} <span className="text-slate-400">{vaultItems.filter((v) => (v.folder || 'Unfiled') === f).length}</span>
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* Security */}
      <Card title={<CardTitle Icon={ShieldAlert}>Security posture</CardTitle>} actions={<ViewAll onClick={() => go('security')} />}>
        <KV k="Open incidents">
          <span className={openIncidents.length ? 'text-rose-600 font-semibold' : 'text-emerald-600'}>{openIncidents.length}</span>
          {openIncidents.some((i) => i.severity === 'critical' || i.severity === 'high') && (
            <span className="ml-1 text-[10px] text-rose-500">({openIncidents.filter((i) => i.severity === 'critical' || i.severity === 'high').length} high/critical)</span>
          )}
        </KV>
        <KV k="Avg patch compliance">{avgPatch == null ? '—' : <span className={avgPatch < 85 ? 'text-amber-600 font-semibold' : 'text-emerald-600'}>{avgPatch}%</span>}</KV>
        <KV k="Disk encryption">{devices.length ? `${encrypted}/${devices.length} encrypted` : '—'}</KV>
        <KV k="Critical / offline devices">
          {devices.filter((d) => d.health === 'critical').length} / {devices.filter((d) => d.health === 'offline').length}
        </KV>
      </Card>

      {/* Notes */}
      <Card title={<CardTitle Icon={StickyNote}>Notes</CardTitle>} actions={<ViewAll onClick={() => go('notes')} />} className="lg:col-span-2 xl:col-span-3">
        {client.notes ? <p className="text-xs text-slate-700 whitespace-pre-wrap">{client.notes}</p> : <Muted>No notes</Muted>}
      </Card>
    </div>
  );
};

const ContactRow: React.FC<{ name?: string; title?: string; email?: string; phone?: string; primary?: boolean; billing?: boolean }> = ({
  name,
  title,
  email,
  phone,
  primary,
  billing
}) => (
  <div className="min-w-0">
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-semibold text-slate-800 truncate">{name || '—'}</span>
      {title && <span className="text-[11px] text-slate-400 truncate">{title}</span>}
      {primary && <Star className="w-3 h-3 text-amber-500 shrink-0" aria-label="Primary" />}
      {billing && <Receipt className="w-3 h-3 text-emerald-600 shrink-0" aria-label="Billing" />}
    </div>
    <div className="flex flex-wrap gap-x-3 text-[11px] text-slate-500">
      {email && (
        <a href={`mailto:${email}`} className="inline-flex items-center gap-1 hover:text-violet-600">
          <Mail className="w-3 h-3" />
          {email}
        </a>
      )}
      {phone && (
        <a href={`tel:${phone}`} className="inline-flex items-center gap-1 hover:text-violet-600">
          <Phone className="w-3 h-3" />
          {phone}
        </a>
      )}
    </div>
  </div>
);

const groupByOs = (devices: ManagedDevice[]) => {
  const m = new Map<DeviceOS, ManagedDevice[]>();
  devices.forEach((d) => m.set(d.os, [...(m.get(d.os) || []), d]));
  return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length);
};

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------
export const AssetsTab: React.FC<TabProps> = ({ data }) => {
  const { devices, mdmDevices, unifiSites } = data;
  const link = useDeepLinks();
  const byOs = groupByOs(devices);
  const online = devices.filter((d) => d.health !== 'offline').length;
  const sorted = [...devices].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-3 text-xs text-violet-900">
        <span className="font-bold">Billable now:</span>{' '}
        {byOs.length === 0 && mdmDevices.length === 0
          ? 'no devices'
          : [...byOs.map(([os, l]) => `${l.length} ${OS_LABEL[os] || os}`), ...(mdmDevices.length ? [`${mdmDevices.length} MDM tablet${mdmDevices.length === 1 ? '' : 's'}`] : [])].join(' · ')}
        <span className="text-violet-600/80">
          {' '}
          — {devices.length} RMM device{devices.length === 1 ? '' : 's'} ({online} online, {devices.length - online} offline). Per-device contract lines use these counts.
        </span>
      </div>

      <Card title={<CardTitle Icon={Monitor}>Managed devices ({devices.length})</CardTitle>} padded={false}>
        {devices.length === 0 ? (
          <EmptyState Icon={Monitor} title="No managed devices" body="Deploy the RMM agent to this client's endpoints to see them here." />
        ) : (
          <Table
            head={
              <>
                <Th>Device</Th>
                <Th>OS</Th>
                <Th className="hidden md:table-cell">Site</Th>
                <Th>Health</Th>
                <Th className="hidden sm:table-cell">Last seen</Th>
                <Th right className="hidden md:table-cell">Patch</Th>
                <Th />
              </>
            }
          >
            {sorted.map((d) => (
              <tr key={d.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => link.device(d.id)}>
                <Td>
                  <div className="font-semibold text-slate-800">{d.name}</div>
                  <div className="text-[11px] text-slate-400">{d.hostname}</div>
                </Td>
                <Td>
                  <div>{OS_LABEL[d.os] || d.os}</div>
                  <div className="text-[11px] text-slate-400 truncate max-w-[160px]">{d.osVersion}</div>
                </Td>
                <Td className="hidden md:table-cell text-slate-600">{d.siteName || '—'}</Td>
                <Td>
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${HEALTH_DOT[d.health] || 'bg-slate-300'}`} />
                    {statusLabel(d.health)}
                  </span>
                </Td>
                <Td className="hidden sm:table-cell text-slate-500">{dateTime(d.metrics?.lastSeen)}</Td>
                <Td right className="hidden md:table-cell">
                  <span className={d.patchCompliance < 85 ? 'text-amber-600 font-semibold' : 'text-emerald-600'}>{d.patchCompliance}%</span>
                  {d.pendingPatchesCount > 0 && <div className="text-[10px] text-slate-400">{d.pendingPatchesCount} pending</div>}
                </Td>
                <Td right>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-300" />
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title={<CardTitle Icon={Tablet}>MDM tablets ({mdmDevices.length})</CardTitle>} padded={false}>
          {mdmDevices.length === 0 ? (
            <div className="px-4">
              <Muted>No MDM devices mapped to this client</Muted>
            </div>
          ) : (
            <Table
              head={
                <>
                  <Th>Name</Th>
                  <Th>Model</Th>
                  <Th>Serial</Th>
                </>
              }
            >
              {mdmDevices.map((m) => (
                <tr key={m.serial}>
                  <Td className="font-semibold text-slate-800">{m.name || '—'}</Td>
                  <Td>{m.model || '—'}</Td>
                  <Td className="font-mono text-[11px] text-slate-500">{m.serial}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title={<CardTitle Icon={Wifi}>UniFi sites ({unifiSites.length})</CardTitle>} actions={unifiSites.length > 0 ? <ViewAll onClick={link.unifi} label="Open in SOC" /> : undefined} padded={false}>
          {unifiSites.length === 0 ? (
            <div className="px-4">
              <Muted>No UniFi sites linked</Muted>
            </div>
          ) : (
            <Table
              head={
                <>
                  <Th>Site</Th>
                  <Th>Console</Th>
                  <Th>Status</Th>
                  <Th className="hidden sm:table-cell">Firmware</Th>
                </>
              }
            >
              {unifiSites.map((s) => (
                <tr key={s.siteId} className="hover:bg-slate-50 cursor-pointer" onClick={link.unifi}>
                  <Td className="font-semibold text-slate-800">{s.siteName}</Td>
                  <Td>
                    <div>{s.consoleModel}</div>
                    <div className="text-[11px] text-slate-400">{s.consoleName}</div>
                  </Td>
                  <Td>
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${s.online ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      {s.online ? 'Online' : 'Offline'}
                    </span>
                  </Td>
                  <Td className="hidden sm:table-cell text-slate-500">{s.firmwareVersion}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Vault
// ---------------------------------------------------------------------------
export const VaultTab: React.FC<TabProps> = ({ data }) => {
  const link = useDeepLinks();
  const items = [...data.vaultItems].sort((a, b) => (a.folder || '').localeCompare(b.folder || '') || a.title.localeCompare(b.title));
  const open = () => link.vault(data.client.id);
  return (
    <Card
      title={<CardTitle Icon={KeyRound}>Vault items ({items.length})</CardTitle>}
      actions={
        <>
          <button className={btn.secondary} onClick={open}>
            <Plus className="w-3.5 h-3.5" /> Add credential
          </button>
          <button className={btn.primary} onClick={open}>
            <ExternalLink className="w-3.5 h-3.5" /> Open in Vault
          </button>
        </>
      }
      padded={false}
    >
      {items.length === 0 ? (
        <EmptyState Icon={KeyRound} title="No credentials stored" body="Store this client's admin logins, Wi-Fi keys and server credentials in the Vault." />
      ) : (
        <Table
          head={
            <>
              <Th>Title</Th>
              <Th className="hidden sm:table-cell">Type</Th>
              <Th>Folder</Th>
              <Th className="hidden md:table-cell">Username</Th>
              <Th className="hidden lg:table-cell">URL</Th>
              <Th className="hidden sm:table-cell">Modified</Th>
            </>
          }
        >
          {items.map((v) => (
            <tr key={v.id} className="hover:bg-slate-50 cursor-pointer" onClick={open}>
              <Td>
                <span className="font-semibold text-slate-800">{v.title}</span>
                {v.favorite && <Star className="w-3 h-3 text-amber-500 inline ml-1 -mt-0.5" />}
              </Td>
              <Td className="hidden sm:table-cell text-slate-600">{statusLabel(v.type)}</Td>
              <Td className="text-slate-600">{v.folder || '—'}</Td>
              <Td className="hidden md:table-cell font-mono text-[11px] text-slate-600">{v.username || '—'}</Td>
              <Td className="hidden lg:table-cell text-slate-500 truncate max-w-[220px]">{v.url || '—'}</Td>
              <Td className="hidden sm:table-cell text-slate-500">{shortDate(v.lastModified)}</Td>
            </tr>
          ))}
        </Table>
      )}
      <div className="px-4 py-2 border-t border-slate-100 text-[10px] text-slate-400">Passwords are never shown here — open the Vault and unlock to reveal.</div>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Tickets & Time
// ---------------------------------------------------------------------------
export const TicketsTab: React.FC<TabProps & { onInvoiceTime: (ids: string[]) => Promise<void> }> = ({ data, onInvoiceTime }) => {
  const link = useDeepLinks();
  const [showClosed, setShowClosed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(data.unbilledTime.map((u) => u.entry.id)));
  const [busy, setBusy] = useState(false);

  const tickets = [...data.tickets].filter((t) => showClosed || OPEN_TICKET(t)).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const unbilled = [...data.unbilledTime].sort((a, b) => (b.entry.date || '').localeCompare(a.entry.date || ''));
  const sel = unbilled.filter((u) => selected.has(u.entry.id));
  const selAmt = sel.reduce((s, u) => s + u.amount, 0);
  const selMin = sel.reduce((s, u) => s + u.entry.minutes, 0);
  const allSel = unbilled.length > 0 && sel.length === unbilled.length;

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const invoice = async () => {
    setBusy(true);
    try {
      await onInvoiceTime(sel.map((u) => u.entry.id));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card
        title={<CardTitle Icon={Clock}>Unbilled time ({unbilled.length})</CardTitle>}
        actions={
          unbilled.length > 0 && (
            <button className={btn.primary} disabled={busy || sel.length === 0} onClick={invoice}>
              <Receipt className="w-3.5 h-3.5" />
              {busy ? 'Creating…' : `Invoice selected (${money(selAmt)} · ${hours(selMin)})`}
            </button>
          )
        }
        padded={false}
      >
        {unbilled.length === 0 ? (
          <div className="px-4">
            <Muted>All billable time has been invoiced.</Muted>
          </div>
        ) : (
          <Table
            head={
              <>
                <Th className="w-8">
                  <input
                    type="checkbox"
                    className="accent-violet-600"
                    checked={allSel}
                    onChange={() => setSelected(allSel ? new Set() : new Set(unbilled.map((u) => u.entry.id)))}
                    aria-label="Select all"
                  />
                </Th>
                <Th>Ticket</Th>
                <Th className="hidden sm:table-cell">Tech</Th>
                <Th>Date</Th>
                <Th right>Time</Th>
                <Th className="hidden lg:table-cell">Description</Th>
                <Th right className="hidden md:table-cell">Rate</Th>
                <Th right>Amount</Th>
              </>
            }
          >
            {unbilled.map((u) => (
              <tr key={u.entry.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => toggle(u.entry.id)}>
                <Td>
                  <input type="checkbox" className="accent-violet-600" checked={selected.has(u.entry.id)} onChange={() => toggle(u.entry.id)} onClick={(e) => e.stopPropagation()} />
                </Td>
                <Td>
                  <button
                    className="text-violet-700 hover:underline font-semibold"
                    onClick={(e) => {
                      e.stopPropagation();
                      link.ticket(u.ticketId);
                    }}
                  >
                    {u.ticketNumber}
                  </button>
                  <div className="text-[11px] text-slate-500 truncate max-w-[200px]">{u.ticketTitle}</div>
                </Td>
                <Td className="hidden sm:table-cell">{u.entry.technician}</Td>
                <Td className="text-slate-500">{shortDate(u.entry.date)}</Td>
                <Td right>{u.entry.minutes}m</Td>
                <Td className="hidden lg:table-cell text-slate-600 truncate max-w-[280px]">{u.entry.description}</Td>
                <Td right className="hidden md:table-cell">
                  {money(u.entry.hourlyRate)}/h
                </Td>
                <Td right className="font-semibold">
                  {money(u.amount)}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card
        title={<CardTitle Icon={Ticket}>Tickets ({tickets.length})</CardTitle>}
        actions={
          <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
            <input type="checkbox" className="accent-violet-600" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
            Show resolved/closed
          </label>
        }
        padded={false}
      >
        {tickets.length === 0 ? (
          <EmptyState Icon={Ticket} title={showClosed ? 'No tickets' : 'No open tickets'} />
        ) : (
          <Table
            head={
              <>
                <Th>#</Th>
                <Th>Title</Th>
                <Th>Status</Th>
                <Th className="hidden sm:table-cell">Priority</Th>
                <Th className="hidden md:table-cell">Assigned</Th>
                <Th className="hidden lg:table-cell">Updated</Th>
              </>
            }
          >
            {tickets.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => link.ticket(t.id)}>
                <Td className="text-slate-500 whitespace-nowrap">{t.ticketNumber}</Td>
                <Td>
                  <div className="text-slate-800 font-medium">{t.title}</div>
                  {t.slaBreached && <div className="text-[10px] text-rose-600 font-semibold">SLA breached</div>}
                </Td>
                <Td>
                  <StatusBadge status={t.status} />
                </Td>
                <Td className="hidden sm:table-cell">
                  <Pill cls={PRIORITY_STYLE[t.priority] || PRIORITY_STYLE.low}>{statusLabel(t.priority)}</Pill>
                </Td>
                <Td className="hidden md:table-cell">{t.assignedTech || '—'}</Td>
                <Td className="hidden lg:table-cell text-slate-500">{dateTime(t.updatedAt)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------
export type BillingSection = 'contracts' | BillingDocType | 'payments' | 'statement';

export const BillingTab: React.FC<TabProps & { onRecordPayment: () => void; initialSection?: BillingSection }> = ({
  data,
  onRecordPayment,
  initialSection = 'invoice'
}) => {
  const { openDocument, openContract, newDocument, settings } = useBilling();
  const [active, setSection] = useState<BillingSection>(initialSection);
  const currency = settings?.currency || 'USD';
  const m = (n: number) => money(n, currency);

  const byType = (t: BillingDocType) =>
    data.documents.filter((d) => d.type === t).sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || '') || b.number.localeCompare(a.number));

  const sections: { key: BillingSection; label: string; count?: number }[] = [
    { key: 'contracts', label: 'Contracts', count: data.contracts.length },
    { key: 'quote', label: 'Quotes', count: byType('quote').length },
    { key: 'sales_order', label: 'Sales Orders', count: byType('sales_order').length },
    { key: 'invoice', label: 'Invoices', count: byType('invoice').length },
    { key: 'credit_note', label: 'Credit Notes', count: byType('credit_note').length },
    { key: 'payments', label: 'Payments', count: data.payments.length },
    { key: 'statement', label: 'Statement' }
  ];

  const docTable = (type: BillingDocType) => {
    const docs = byType(type);
    const label = DOC_LABEL[type];
    return (
      <Card
        title={label.many}
        actions={
          <button className={btn.secondary} onClick={() => newDocument(type, { clientId: data.client.id })}>
            <Plus className="w-3.5 h-3.5" /> New {label.one}
          </button>
        }
        padded={false}
      >
        {docs.length === 0 ? (
          <EmptyState Icon={FileText} title={`No ${label.many.toLowerCase()}`} />
        ) : (
          <Table
            head={
              <>
                <Th>Number</Th>
                <Th>Status</Th>
                <Th className="hidden sm:table-cell">Date</Th>
                <Th className="hidden md:table-cell">{type === 'quote' ? 'Expires' : type === 'invoice' ? 'Due' : ''}</Th>
                <Th className="hidden lg:table-cell">Subject</Th>
                <Th right>Total</Th>
                {type === 'invoice' && <Th right>Balance</Th>}
              </>
            }
          >
            {docs.map((d) => (
              <tr key={d.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => openDocument(d.id, type)}>
                <Td className="font-semibold text-slate-800 whitespace-nowrap">{d.number}</Td>
                <Td>
                  <StatusBadge status={d.status} />
                </Td>
                <Td className="hidden sm:table-cell text-slate-500">{shortDate(d.issueDate)}</Td>
                <Td className="hidden md:table-cell text-slate-500">{type === 'quote' ? shortDate(d.expiryDate) : type === 'invoice' ? shortDate(d.dueDate) : ''}</Td>
                <Td className="hidden lg:table-cell text-slate-600 truncate max-w-[240px]">{d.subject || d.reference || '—'}</Td>
                <Td right>{m(d.total)}</Td>
                {type === 'invoice' && (
                  <Td right className={d.balanceDue > 0 ? (d.status === 'overdue' ? 'text-rose-600 font-semibold' : 'text-slate-800 font-semibold') : 'text-slate-400'}>
                    {m(d.balanceDue)}
                  </Td>
                )}
              </tr>
            ))}
          </Table>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 flex-wrap">
        {sections.map((s) => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${
              active === s.key ? 'bg-[#090113] text-white border-[#090113]' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            {s.label}
            {typeof s.count === 'number' && <span className={`ml-1 tabular-nums ${active === s.key ? 'text-white/70' : 'text-slate-400'}`}>{s.count}</span>}
          </button>
        ))}
      </div>

      {active === 'contracts' && (
        <Card
          title="Contracts"
          actions={
            <button className={btn.secondary} onClick={() => openContract('new', data.client.id)}>
              <Plus className="w-3.5 h-3.5" /> New Contract
            </button>
          }
          padded={false}
        >
          {data.contracts.length === 0 ? (
            <EmptyState Icon={FileText} title="No contracts" body="Create a recurring contract to bill this client automatically." />
          ) : (
            <Table
              head={
                <>
                  <Th>Contract</Th>
                  <Th>Status</Th>
                  <Th className="hidden sm:table-cell">Frequency</Th>
                  <Th className="hidden md:table-cell">Next invoice</Th>
                  <Th className="hidden lg:table-cell">Term</Th>
                  <Th right>Recurring</Th>
                  <Th right className="hidden sm:table-cell">MRR</Th>
                </>
              }
            >
              {data.contracts.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => openContract(c.id)}>
                  <Td>
                    <div className="font-semibold text-slate-800">{c.name}</div>
                    <div className="text-[11px] text-slate-400">{c.number}</div>
                  </Td>
                  <Td>
                    <StatusBadge status={c.status} />
                  </Td>
                  <Td className="hidden sm:table-cell">{FREQ_LABEL[c.billingFrequency]}</Td>
                  <Td className="hidden md:table-cell text-slate-500">{shortDate(c.nextInvoiceDate)}</Td>
                  <Td className="hidden lg:table-cell text-slate-500">
                    {shortDate(c.startDate)} – {c.endDate ? shortDate(c.endDate) : c.autoRenew ? 'auto-renew' : 'open'}
                  </Td>
                  <Td right>{m(c.recurringAmount || 0)}</Td>
                  <Td right className="hidden sm:table-cell">
                    {m(c.mrr || 0)}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      {(active === 'quote' || active === 'sales_order' || active === 'invoice' || active === 'credit_note') && docTable(active)}

      {active === 'payments' && (
        <Card
          title="Payments"
          actions={
            <button className={btn.secondary} onClick={onRecordPayment}>
              <CreditCard className="w-3.5 h-3.5" /> Record Payment
            </button>
          }
          padded={false}
        >
          {data.payments.length === 0 ? (
            <EmptyState Icon={CreditCard} title="No payments recorded" />
          ) : (
            <Table
              head={
                <>
                  <Th>Number</Th>
                  <Th>Date</Th>
                  <Th className="hidden sm:table-cell">Method</Th>
                  <Th className="hidden md:table-cell">Applied to</Th>
                  <Th right>Amount</Th>
                  <Th right className="hidden sm:table-cell">Unapplied</Th>
                </>
              }
            >
              {[...data.payments]
                .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                .map((p) => (
                  <tr key={p.id} className={p.voided ? 'opacity-50' : ''}>
                    <Td className="font-semibold text-slate-800 whitespace-nowrap">
                      {p.number}
                      {p.voided && <StatusBadge status="void" className="ml-1.5" />}
                    </Td>
                    <Td className="text-slate-500">{shortDate(p.date)}</Td>
                    <Td className="hidden sm:table-cell">
                      {METHOD_LABEL[p.method] || p.method}
                      {p.reference && <div className="text-[10px] text-slate-400">{p.reference}</div>}
                    </Td>
                    <Td className="hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {p.allocations.length === 0 && <span className="text-slate-400">—</span>}
                        {p.allocations.map((a) => (
                          <button key={a.invoiceId} onClick={() => openDocument(a.invoiceId, 'invoice')} className="text-violet-700 hover:underline text-[11px]">
                            {a.invoiceNumber} ({m(a.amount)})
                          </button>
                        ))}
                      </div>
                    </Td>
                    <Td right className="font-semibold">
                      {m(p.amount)}
                    </Td>
                    <Td right className="hidden sm:table-cell text-emerald-600">
                      {p.unapplied > 0 ? m(p.unapplied) : '—'}
                    </Td>
                  </tr>
                ))}
            </Table>
          )}
        </Card>
      )}

      {active === 'statement' && <Statement data={data} />}
    </div>
  );
};

interface StatementRow {
  date: string;
  label: string;
  ref: string;
  debit: number;
  credit: number;
  docId?: string;
  docType?: BillingDocType;
}

const Statement: React.FC<{ data: ClientOverview }> = ({ data }) => {
  const { openDocument, settings } = useBilling();
  const currency = settings?.currency || 'USD';
  const m = (n: number) => money(n, currency);

  const rows = useMemo(() => {
    const r: StatementRow[] = [];
    data.documents.forEach((d: BillingDocument) => {
      if (d.status === 'void' || d.status === 'draft' || d.status === 'pending_review') return;
      if (d.type === 'invoice') r.push({ date: d.issueDate, label: 'Invoice', ref: d.number, debit: d.total, credit: 0, docId: d.id, docType: 'invoice' });
      if (d.type === 'credit_note') r.push({ date: d.issueDate, label: 'Credit note', ref: d.number, debit: 0, credit: d.total, docId: d.id, docType: 'credit_note' });
    });
    data.payments.forEach((p) => {
      if (p.voided) return;
      r.push({ date: p.date, label: `Payment — ${METHOD_LABEL[p.method] || p.method}`, ref: p.number + (p.reference ? ` (${p.reference})` : ''), debit: 0, credit: p.amount });
    });
    r.sort((a, b) => (a.date || '').localeCompare(b.date || '') || b.debit - a.debit);
    let bal = 0;
    return r.map((x) => {
      bal += x.debit - x.credit;
      return { ...x, balance: Math.round(bal * 100) / 100 };
    });
  }, [data]);

  const final = rows.length ? rows[rows.length - 1].balance : 0;

  const print = () => {
    const w = window.open('', '_blank', 'width=900,height=1000');
    if (!w) {
      window.print();
      return;
    }
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const addr = addressLines(data.client.billingAddress).map(esc).join('<br/>');
    w.document.write(`<!doctype html><html><head><title>Statement — ${esc(data.client.name)}</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1e293b;font-size:12px;padding:32px}
h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin-top:24px}
th,td{padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:left}th{font-size:10px;text-transform:uppercase;color:#64748b;background:#f8fafc}
.r{text-align:right;font-variant-numeric:tabular-nums}.muted{color:#64748b}.tot td{font-weight:700;border-top:2px solid #334155}</style></head><body>
<div style="display:flex;justify-content:space-between"><div><h1>Statement of Account</h1><div class="muted">${esc(settings?.companyName || '')}</div></div>
<div style="text-align:right"><div class="muted">Date</div><div>${esc(shortDate(new Date().toISOString()))}</div></div></div>
<div style="margin-top:20px"><div class="muted">Bill to</div><strong>${esc(data.client.name)}</strong><br/>${addr}</div>
<table><thead><tr><th>Date</th><th>Transaction</th><th>Reference</th><th class="r">Charges</th><th class="r">Credits</th><th class="r">Balance</th></tr></thead><tbody>
${rows
  .map(
    (x) =>
      `<tr><td>${esc(shortDate(x.date))}</td><td>${esc(x.label)}</td><td>${esc(x.ref)}</td><td class="r">${x.debit ? esc(m(x.debit)) : ''}</td><td class="r">${x.credit ? esc(m(x.credit)) : ''}</td><td class="r">${esc(m(x.balance))}</td></tr>`
  )
  .join('')}
<tr class="tot"><td colspan="5">Balance due</td><td class="r">${esc(m(final))}</td></tr></tbody></table>
<script>window.onload=function(){window.print()}</script></body></html>`);
    w.document.close();
  };

  return (
    <Card
      title="Statement of account"
      actions={
        <button className={btn.secondary} onClick={print} disabled={rows.length === 0}>
          <Printer className="w-3.5 h-3.5" /> Print
        </button>
      }
      padded={false}
    >
      {rows.length === 0 ? (
        <EmptyState Icon={FileText} title="No transactions" body="Sent invoices, credit notes and payments will appear here." />
      ) : (
        <Table
          head={
            <>
              <Th>Date</Th>
              <Th>Transaction</Th>
              <Th className="hidden sm:table-cell">Reference</Th>
              <Th right>Charges</Th>
              <Th right>Credits</Th>
              <Th right>Balance</Th>
            </>
          }
        >
          {rows.map((x, i) => (
            <tr key={i} className={x.docId ? 'hover:bg-slate-50 cursor-pointer' : ''} onClick={() => x.docId && openDocument(x.docId, x.docType)}>
              <Td className="text-slate-500 whitespace-nowrap">{shortDate(x.date)}</Td>
              <Td>{x.label}</Td>
              <Td className="hidden sm:table-cell text-slate-600">{x.ref}</Td>
              <Td right>{x.debit ? m(x.debit) : ''}</Td>
              <Td right className="text-emerald-600">
                {x.credit ? m(x.credit) : ''}
              </Td>
              <Td right className="font-semibold">
                {m(x.balance)}
              </Td>
            </tr>
          ))}
          <tr className="bg-slate-50">
            <Td colSpan={5} className="font-bold text-slate-700">
              Balance due
            </Td>
            <Td right className={`font-bold ${final > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {m(final)}
            </Td>
          </tr>
        </Table>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Security
// ---------------------------------------------------------------------------
export const SecurityTab: React.FC<TabProps> = ({ data }) => {
  const link = useDeepLinks();
  const [showClosed, setShowClosed] = useState(false);
  const list = [...data.incidents].filter((i) => showClosed || OPEN_INCIDENT(i)).sort((a, b) => (b.lastEventTime || '').localeCompare(a.lastEventTime || ''));
  return (
    <Card
      title={<CardTitle Icon={ShieldAlert}>Security incidents ({list.length})</CardTitle>}
      actions={
        <>
          <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer mr-2">
            <input type="checkbox" className="accent-violet-600" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
            Show resolved
          </label>
          <button className={btn.secondary} onClick={link.incidents}>
            <ExternalLink className="w-3.5 h-3.5" /> Open SOC
          </button>
        </>
      }
      padded={false}
    >
      {list.length === 0 ? (
        <EmptyState Icon={ShieldAlert} title={showClosed ? 'No incidents' : 'No open incidents'} body="Nothing needs attention for this client right now." />
      ) : (
        <Table
          head={
            <>
              <Th>#</Th>
              <Th>Title</Th>
              <Th>Severity</Th>
              <Th className="hidden sm:table-cell">Status</Th>
              <Th className="hidden md:table-cell">Device</Th>
              <Th className="hidden lg:table-cell">Last event</Th>
            </>
          }
        >
          {list.map((i) => (
            <tr key={i.id} className="hover:bg-slate-50 cursor-pointer" onClick={link.incidents}>
              <Td className="text-slate-500 whitespace-nowrap">{i.incidentNumber}</Td>
              <Td>
                <div className="text-slate-800 font-medium">{i.title}</div>
                <div className="text-[11px] text-slate-400">{statusLabel(i.category)}</div>
              </Td>
              <Td>
                <Pill cls={SEVERITY_STYLE[i.severity] || SEVERITY_STYLE.info}>{statusLabel(i.severity)}</Pill>
              </Td>
              <Td className="hidden sm:table-cell">{statusLabel(i.status)}</Td>
              <Td className="hidden md:table-cell text-slate-600">{i.deviceName || '—'}</Td>
              <Td className="hidden lg:table-cell text-slate-500">{dateTime(i.lastEventTime)}</Td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Notes & Contacts
// ---------------------------------------------------------------------------
export const NotesTab: React.FC<TabProps & { onEdit: () => void }> = ({ data, onEdit }) => {
  const { client } = data;
  const contacts = client.contacts || [];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card
        title={<CardTitle Icon={Users}>Contacts ({contacts.length + (client.contactName ? 1 : 0)})</CardTitle>}
        actions={
          <button className={btn.secondary} onClick={onEdit}>
            <Pencil className="w-3.5 h-3.5" /> Edit contacts
          </button>
        }
        padded={false}
      >
        <div className="divide-y divide-slate-100">
          {client.contactName || client.contactEmail ? (
            <div className="px-4 py-2.5">
              <ContactRow name={client.contactName} title="Primary contact" email={client.contactEmail} phone={client.contactPhone} primary />
            </div>
          ) : null}
          {contacts.map((c) => (
            <div key={c.id} className="px-4 py-2.5">
              <ContactRow name={c.name} title={c.title} email={c.email} phone={c.phone} primary={c.isPrimary} billing={c.isBilling} />
            </div>
          ))}
          {!client.contactName && !client.contactEmail && contacts.length === 0 && (
            <EmptyState Icon={Users} title="No contacts" action={<button className={btn.primary} onClick={onEdit}><Plus className="w-3.5 h-3.5" /> Add contact</button>} />
          )}
        </div>
      </Card>
      <Card
        title={<CardTitle Icon={StickyNote}>Notes</CardTitle>}
        actions={
          <button className={btn.secondary} onClick={onEdit}>
            <Pencil className="w-3.5 h-3.5" /> Edit notes
          </button>
        }
      >
        {client.notes ? <p className="text-xs text-slate-700 whitespace-pre-wrap">{client.notes}</p> : <Muted>No notes yet.</Muted>}
        {client.updatedAt && <div className="text-[10px] text-slate-400 mt-3">Last updated {dateTime(client.updatedAt)}</div>}
      </Card>
    </div>
  );
};
