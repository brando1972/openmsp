import React, { useState } from 'react';
import { Plus, Trash2, Star, Receipt, X } from 'lucide-react';
import type { ClientContact, ClientStatus, ClientTenant, PaymentTerms, PostalAddress } from '@openmsp/api-types';
import { clientsApi } from '../../services/billingApi';
import { useBilling } from '../../data/BillingContext';
import { Modal, Field, ErrorBanner, btn, input } from '../billing/ui';
import { TERMS_LABEL, newId } from '../billing/format';

/**
 * ClientFormModal — create / edit a client (company, contacts, billing profile, service).
 */

const SLA_TIERS: ClientTenant['monthlySlaTier'][] = ['Gold 24/7', 'Silver 8/5', 'Bronze Best Effort'];
const STATUSES: ClientStatus[] = ['active', 'prospect', 'inactive'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const Section: React.FC<{ title: string; children: React.ReactNode; actions?: React.ReactNode }> = ({ title, children, actions }) => (
  <section className="space-y-3">
    <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{title}</h3>
      {actions}
    </div>
    {children}
  </section>
);

interface Props {
  client?: ClientTenant | null;
  onClose: () => void;
  onSaved?: (client: ClientTenant) => void;
}

export const ClientFormModal: React.FC<Props> = ({ client, onClose, onSaved }) => {
  const { taxRates, settings, refreshClients, bump } = useBilling();
  const editing = !!client;

  const [name, setName] = useState(client?.name || '');
  const [domain, setDomain] = useState(client?.domain || '');
  const [website, setWebsite] = useState(client?.website || '');
  const [industry, setIndustry] = useState(client?.industry || '');
  const [status, setStatus] = useState<ClientStatus>(client?.status || 'active');

  const [contactName, setContactName] = useState(client?.contactName || '');
  const [contactEmail, setContactEmail] = useState(client?.contactEmail || '');
  const [contactPhone, setContactPhone] = useState(client?.contactPhone || '');
  const [contacts, setContacts] = useState<ClientContact[]>(client?.contacts || []);

  const [billingEmail, setBillingEmail] = useState(client?.billingEmail || '');
  const [addr, setAddr] = useState<PostalAddress>(client?.billingAddress || {});
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>(client?.paymentTerms || settings?.defaultPaymentTerms || 'net_30');
  const [taxRateId, setTaxRateId] = useState(client?.taxRateId || '');
  const [taxExempt, setTaxExempt] = useState(!!client?.taxExempt);
  const [billableUsers, setBillableUsers] = useState<string>(client?.billableUsers != null ? String(client.billableUsers) : '');

  const [slaTier, setSlaTier] = useState<ClientTenant['monthlySlaTier']>(client?.monthlySlaTier || 'Silver 8/5');
  const [sites, setSites] = useState<string[]>(client?.sites || []);
  const [siteDraft, setSiteDraft] = useState('');
  const [notes, setNotes] = useState(client?.notes || '');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const updateContact = (id: string, patch: Partial<ClientContact>) =>
    setContacts((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : patch.isPrimary ? { ...c, isPrimary: false } : c)));

  const addSite = () => {
    const parts = siteDraft
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !sites.includes(s));
    if (parts.length) setSites([...sites, ...parts]);
    setSiteDraft('');
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Company name is required';
    if (contactEmail && !EMAIL_RE.test(contactEmail.trim())) e.contactEmail = 'Invalid email';
    if (billingEmail && !EMAIL_RE.test(billingEmail.trim())) e.billingEmail = 'Invalid email';
    contacts.forEach((c) => {
      if (!c.name.trim()) e[`c-${c.id}-name`] = 'Name required';
      if (c.email && !EMAIL_RE.test(c.email.trim())) e[`c-${c.id}-email`] = 'Invalid email';
    });
    if (billableUsers && (Number.isNaN(Number(billableUsers)) || Number(billableUsers) < 0)) e.billableUsers = 'Must be ≥ 0';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    const pendingSites = siteDraft
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const payload: Partial<ClientTenant> = {
      name: name.trim(),
      domain: domain.trim(),
      website: website.trim() || undefined,
      industry: industry.trim() || undefined,
      status,
      contactName: contactName.trim(),
      contactEmail: contactEmail.trim(),
      contactPhone: contactPhone.trim(),
      contacts: contacts.map((c) => ({ ...c, name: c.name.trim(), email: c.email?.trim() || undefined })),
      billingEmail: billingEmail.trim() || undefined,
      billingAddress: addr,
      paymentTerms,
      taxRateId: taxRateId || undefined,
      taxExempt,
      billableUsers: billableUsers === '' ? undefined : Number(billableUsers),
      monthlySlaTier: slaTier,
      sites: Array.from(new Set([...sites, ...pendingSites])),
      notes: notes.trim() || undefined
    };
    setSaving(true);
    setSaveError(null);
    try {
      const saved = editing ? await clientsApi.update(client!.id, payload) : await clientsApi.create(payload);
      await refreshClients();
      bump();
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setSaveError((err as Error).message || 'Failed to save client');
    } finally {
      setSaving(false);
    }
  };

  const err = (k: string) => (errors[k] ? <span className="block text-[10px] text-rose-600 mt-0.5">{errors[k]}</span> : null);
  const errCls = (k: string) => (errors[k] ? ' border-rose-300 focus:ring-rose-200' : '');

  return (
    <Modal
      title={editing ? `Edit ${client!.name}` : 'New Client'}
      onClose={onClose}
      width="max-w-3xl"
      footer={
        <>
          <button className={btn.secondary} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className={btn.primary} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create client'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <ErrorBanner error={saveError} />

        <Section title="Company">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Company name *">
              <input className={input + errCls('name')} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              {err('name')}
            </Field>
            <Field label="Status">
              <select className={input} value={status} onChange={(e) => setStatus(e.target.value as ClientStatus)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Domain">
              <input className={input} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="acme.com" />
            </Field>
            <Field label="Website">
              <input className={input} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://acme.com" />
            </Field>
            <Field label="Industry">
              <input className={input} value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Retail, Healthcare, Municipal…" />
            </Field>
          </div>
        </Section>

        <Section title="Primary contact">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Name">
              <input className={input} value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </Field>
            <Field label="Email">
              <input className={input + errCls('contactEmail')} type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
              {err('contactEmail')}
            </Field>
            <Field label="Phone">
              <input className={input} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section
          title={`Additional contacts (${contacts.length})`}
          actions={
            <button
              type="button"
              className={btn.ghost}
              onClick={() => setContacts([...contacts, { id: newId('ct'), name: '', email: '', phone: '', title: '' }])}
            >
              <Plus className="w-3.5 h-3.5" /> Add contact
            </button>
          }
        >
          {contacts.length === 0 ? (
            <div className="text-[11px] text-slate-400">No additional contacts.</div>
          ) : (
            <div className="space-y-2">
              {contacts.map((c) => (
                <div key={c.id} className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-start p-2 rounded-lg border border-slate-100 bg-slate-50/50">
                  <div className="sm:col-span-3">
                    <input className={input + errCls(`c-${c.id}-name`)} placeholder="Name *" value={c.name} onChange={(e) => updateContact(c.id, { name: e.target.value })} />
                    {err(`c-${c.id}-name`)}
                  </div>
                  <input className={input + ' sm:col-span-2'} placeholder="Title" value={c.title || ''} onChange={(e) => updateContact(c.id, { title: e.target.value })} />
                  <div className="sm:col-span-3">
                    <input className={input + errCls(`c-${c.id}-email`)} placeholder="Email" value={c.email || ''} onChange={(e) => updateContact(c.id, { email: e.target.value })} />
                    {err(`c-${c.id}-email`)}
                  </div>
                  <input className={input + ' sm:col-span-2'} placeholder="Phone" value={c.phone || ''} onChange={(e) => updateContact(c.id, { phone: e.target.value })} />
                  <div className="col-span-2 sm:col-span-2 flex items-center justify-end gap-1 pt-0.5">
                    <button
                      type="button"
                      title="Primary contact"
                      onClick={() => updateContact(c.id, { isPrimary: !c.isPrimary })}
                      className={`p-1.5 rounded-md border text-[10px] ${c.isPrimary ? 'bg-amber-50 border-amber-200 text-amber-600' : 'border-slate-200 text-slate-400 hover:text-slate-600'}`}
                    >
                      <Star className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Billing contact"
                      onClick={() => updateContact(c.id, { isBilling: !c.isBilling })}
                      className={`p-1.5 rounded-md border ${c.isBilling ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'border-slate-200 text-slate-400 hover:text-slate-600'}`}
                    >
                      <Receipt className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Remove"
                      onClick={() => setContacts(contacts.filter((x) => x.id !== c.id))}
                      className="p-1.5 rounded-md border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              <div className="text-[10px] text-slate-400">
                <Star className="w-3 h-3 inline -mt-0.5" /> primary · <Receipt className="w-3 h-3 inline -mt-0.5" /> receives billing emails
              </div>
            </div>
          )}
        </Section>

        <Section title="Billing profile">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Billing email" hint="Invoices are sent here (falls back to primary contact)" className="sm:col-span-2">
              <input className={input + errCls('billingEmail')} type="email" value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} placeholder={contactEmail || 'ap@acme.com'} />
              {err('billingEmail')}
            </Field>
            <Field label="Payment terms">
              <select className={input} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value as PaymentTerms)}>
                {(Object.keys(TERMS_LABEL) as PaymentTerms[]).map((t) => (
                  <option key={t} value={t}>
                    {TERMS_LABEL[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Address line 1" className="sm:col-span-2">
              <input className={input} value={addr.line1 || ''} onChange={(e) => setAddr({ ...addr, line1: e.target.value })} />
            </Field>
            <Field label="Address line 2">
              <input className={input} value={addr.line2 || ''} onChange={(e) => setAddr({ ...addr, line2: e.target.value })} />
            </Field>
            <Field label="City">
              <input className={input} value={addr.city || ''} onChange={(e) => setAddr({ ...addr, city: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="State">
                <input className={input} value={addr.state || ''} onChange={(e) => setAddr({ ...addr, state: e.target.value })} />
              </Field>
              <Field label="ZIP">
                <input className={input} value={addr.postalCode || ''} onChange={(e) => setAddr({ ...addr, postalCode: e.target.value })} />
              </Field>
            </div>
            <Field label="Country">
              <input className={input} value={addr.country || ''} onChange={(e) => setAddr({ ...addr, country: e.target.value })} placeholder="US" />
            </Field>
            <Field label="Default tax rate">
              <select className={input} value={taxRateId} onChange={(e) => setTaxRateId(e.target.value)} disabled={taxExempt}>
                <option value="">Org default</option>
                {taxRates
                  .filter((t) => t.active || t.id === taxRateId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.ratePct}%)
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Tax exempt">
              <label className="flex items-center gap-2 h-[30px] text-xs text-slate-700 cursor-pointer">
                <input type="checkbox" checked={taxExempt} onChange={(e) => setTaxExempt(e.target.checked)} className="accent-violet-600" />
                No tax on invoices
              </label>
            </Field>
            <Field label="Billable users" hint="Seat count for per-user contract lines">
              <input className={input + errCls('billableUsers')} type="number" min={0} value={billableUsers} onChange={(e) => setBillableUsers(e.target.value)} />
              {err('billableUsers')}
            </Field>
          </div>
        </Section>

        <Section title="Service">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="SLA tier">
              <select className={input} value={slaTier} onChange={(e) => setSlaTier(e.target.value as ClientTenant['monthlySlaTier'])}>
                {SLA_TIERS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sites" hint="Press Enter or comma to add" className="sm:col-span-2">
              <div className="flex flex-wrap items-center gap-1 px-1.5 py-1 rounded-lg border border-slate-200 bg-white min-h-[30px]">
                {sites.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-[11px] text-slate-700">
                    {s}
                    <button type="button" onClick={() => setSites(sites.filter((x) => x !== s))} className="text-slate-400 hover:text-rose-600" aria-label={`Remove ${s}`}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <input
                  className="flex-1 min-w-[120px] text-xs outline-none px-1 py-0.5 bg-transparent"
                  value={siteDraft}
                  onChange={(e) => setSiteDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      addSite();
                    } else if (e.key === 'Backspace' && !siteDraft && sites.length) {
                      setSites(sites.slice(0, -1));
                    }
                  }}
                  onBlur={addSite}
                  placeholder={sites.length ? '' : 'Main Office, Warehouse…'}
                />
              </div>
            </Field>
          </div>
        </Section>

        <Section title="Notes">
          <textarea className={input + ' min-h-[70px]'} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes about this client…" />
        </Section>
      </div>
    </Modal>
  );
};

export default ClientFormModal;
