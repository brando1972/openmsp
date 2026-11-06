import React, { useEffect, useState } from 'react';
import type { BillingSettings, PaymentTerms } from '@openmsp/api-types';
import { Settings, Save, CheckCircle2, CircleDashed, CreditCard, Mail } from 'lucide-react';
import { billingApi } from '../../services/billingApi';
import { useBilling } from '../../data/BillingContext';
import { PageHeader, Card, Field, btn, input, ErrorBanner, Loading, Toast } from './ui';
import { TERMS_LABEL } from './format';

/** BillingSettingsView — company/branding on documents, numbering, defaults, and integration status. */
export const BillingSettingsView: React.FC = () => {
  const { settings, refreshReference } = useBilling();
  const [f, setF] = useState<BillingSettings | null>(settings);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (settings && !f) setF(settings);
  }, [settings, f]);

  if (!f) return <Loading />;

  const set = <K extends keyof BillingSettings>(k: K, v: BillingSettings[K]) => setF((p) => (p ? { ...p, [k]: v } : p));
  const setAddr = (k: string, v: string) => setF((p) => (p ? { ...p, companyAddress: { ...p.companyAddress, [k]: v } } : p));
  const setPrefix = (k: keyof BillingSettings['prefixes'], v: string) => setF((p) => (p ? { ...p, prefixes: { ...p.prefixes, [k]: v } } : p));
  const setNext = (k: keyof BillingSettings['nextNumbers'], v: number) => setF((p) => (p ? { ...p, nextNumbers: { ...p.nextNumbers, [k]: v } } : p));

  const save = async () => {
    setError(null);
    if (!f.companyName.trim()) return setError('Company name is required.');
    setSaving(true);
    try {
      const { stripeConfigured: _s, emailConfigured: _e, emailProvider: _p, ...body } = f;
      const saved = await billingApi.updateSettings(body);
      setF(saved);
      await refreshReference();
      setToast('Billing settings saved');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const numbering: { k: keyof BillingSettings['prefixes']; l: string }[] = [
    { k: 'invoice', l: 'Invoices' },
    { k: 'quote', l: 'Quotes' },
    { k: 'salesOrder', l: 'Sales orders' },
    { k: 'creditNote', l: 'Credit notes' },
    { k: 'payment', l: 'Payments' },
    { k: 'contract', l: 'Contracts' }
  ];

  return (
    <>
      <PageHeader Icon={Settings} tint="#64748b" title="Billing Settings" subtitle="Branding, numbering, defaults and integrations">
        <button className={btn.primary} onClick={save} disabled={saving}>
          <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save settings'}
        </button>
      </PageHeader>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-6 pb-24 md:pb-6">
        <div className="max-w-5xl mx-auto space-y-4">
          <ErrorBanner error={error} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Integration
              Icon={CreditCard}
              title="Stripe online payments"
              on={!!f.stripeConfigured}
              onText="Connected — invoices show a Pay now button (card + ACH)."
              offText="Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET on the API server, and point a Stripe webhook at /api/v1/billing/stripe/webhook (events: checkout.session.completed, checkout.session.async_payment_succeeded)."
            />
            <Integration
              Icon={Mail}
              title="Email delivery"
              on={!!f.emailConfigured}
              onText={`Sending via ${f.emailProvider === 'resend' ? 'Resend' : 'SMTP'}.`}
              offText="Set RESEND_API_KEY (or SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS) plus BILLING_FROM_EMAIL on the API server. Until then, Send gives you a ready-made email for your mail app."
            />
          </div>

          <Card title="Company details on invoices">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Company name *">
                <input className={input} value={f.companyName} onChange={(e) => set('companyName', e.target.value)} />
              </Field>
              <Field label="Billing email">
                <input className={input} type="email" value={f.companyEmail || ''} onChange={(e) => set('companyEmail', e.target.value)} />
              </Field>
              <Field label="Phone">
                <input className={input} value={f.companyPhone || ''} onChange={(e) => set('companyPhone', e.target.value)} />
              </Field>
              <Field label="Website">
                <input className={input} value={f.companyWebsite || ''} onChange={(e) => set('companyWebsite', e.target.value)} />
              </Field>
              <Field label="Address line 1">
                <input className={input} value={f.companyAddress?.line1 || ''} onChange={(e) => setAddr('line1', e.target.value)} />
              </Field>
              <Field label="Address line 2">
                <input className={input} value={f.companyAddress?.line2 || ''} onChange={(e) => setAddr('line2', e.target.value)} />
              </Field>
              <div className="grid grid-cols-3 gap-2 sm:col-span-2">
                <Field label="City">
                  <input className={input} value={f.companyAddress?.city || ''} onChange={(e) => setAddr('city', e.target.value)} />
                </Field>
                <Field label="State">
                  <input className={input} value={f.companyAddress?.state || ''} onChange={(e) => setAddr('state', e.target.value)} />
                </Field>
                <Field label="ZIP">
                  <input className={input} value={f.companyAddress?.postalCode || ''} onChange={(e) => setAddr('postalCode', e.target.value)} />
                </Field>
              </div>
              <Field label="Logo URL" hint="PNG/SVG, shown at the top of documents">
                <input className={input} value={f.logoUrl || ''} onChange={(e) => set('logoUrl', e.target.value)} placeholder="https://…/logo.png" />
              </Field>
              <Field label="Brand color">
                <div className="flex gap-2">
                  <input type="color" className="h-8 w-10 rounded border border-slate-200" value={f.brandColor || '#4f46e5'} onChange={(e) => set('brandColor', e.target.value)} />
                  <input className={input} value={f.brandColor || ''} onChange={(e) => set('brandColor', e.target.value)} placeholder="#4f46e5" />
                </div>
              </Field>
              <Field label="Client portal base URL" hint="Where client invoice links point, e.g. https://console.apexmsp.app">
                <input className={input} value={f.publicPortalBaseUrl || ''} onChange={(e) => set('publicPortalBaseUrl', e.target.value)} placeholder={typeof window !== 'undefined' ? window.location.origin : ''} />
              </Field>
              <Field label="Currency">
                <select className={input} value={f.currency} onChange={(e) => set('currency', e.target.value)}>
                  {['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'MXN'].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Numbering">
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                  <tr>
                    <th className="text-left py-1">Document</th>
                    <th className="text-left py-1">Prefix</th>
                    <th className="text-left py-1">Next #</th>
                  </tr>
                </thead>
                <tbody>
                  {numbering.map((n) => (
                    <tr key={n.k}>
                      <td className="py-1 pr-2 text-slate-600">{n.l}</td>
                      <td className="py-1 pr-2">
                        <input className={input} value={f.prefixes[n.k]} onChange={(e) => setPrefix(n.k, e.target.value)} />
                      </td>
                      <td className="py-1">
                        <input className={input} type="number" min="1" value={f.nextNumbers[n.k]} onChange={(e) => setNext(n.k, Number(e.target.value) || 1)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card title="Defaults">
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Payment terms">
                    <select className={input} value={f.defaultPaymentTerms} onChange={(e) => set('defaultPaymentTerms', e.target.value as PaymentTerms)}>
                      {(Object.keys(TERMS_LABEL) as PaymentTerms[]).map((t) => (
                        <option key={t} value={t}>{TERMS_LABEL[t]}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Quotes valid for (days)">
                    <input className={input} type="number" min="1" value={f.quoteValidityDays} onChange={(e) => set('quoteValidityDays', Number(e.target.value) || 30)} />
                  </Field>
                </div>
                <Field label="Audit: flag change vs last invoice above (%)">
                  <input className={input} type="number" min="1" value={f.amountVarianceThresholdPct} onChange={(e) => set('amountVarianceThresholdPct', Number(e.target.value) || 25)} />
                </Field>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Invoice defaults">
              <div className="grid gap-3">
                <Field label="Notes">
                  <textarea className={input} rows={3} value={f.defaultInvoiceNotes || ''} onChange={(e) => set('defaultInvoiceNotes', e.target.value)} placeholder="Thank you for your business!" />
                </Field>
                <Field label="Terms & conditions">
                  <textarea className={input} rows={3} value={f.defaultInvoiceTerms || ''} onChange={(e) => set('defaultInvoiceTerms', e.target.value)} placeholder="Late payments are subject to a 1.5% monthly fee." />
                </Field>
              </div>
            </Card>
            <Card title="Quote defaults">
              <div className="grid gap-3">
                <Field label="Notes">
                  <textarea className={input} rows={3} value={f.defaultQuoteNotes || ''} onChange={(e) => set('defaultQuoteNotes', e.target.value)} />
                </Field>
                <Field label="Terms & conditions">
                  <textarea className={input} rows={3} value={f.defaultQuoteTerms || ''} onChange={(e) => set('defaultQuoteTerms', e.target.value)} />
                </Field>
              </div>
            </Card>
          </div>
        </div>
      </div>
      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
};

const Integration: React.FC<{ Icon: React.ComponentType<{ className?: string }>; title: string; on: boolean; onText: string; offText: string }> = ({ Icon, title, on, onText, offText }) => (
  <div className={`rounded-xl border p-4 ${on ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
    <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
      <Icon className="w-4 h-4" /> {title}
      <span className={`ml-auto flex items-center gap-1 text-[11px] ${on ? 'text-emerald-700' : 'text-slate-400'}`}>
        {on ? <CheckCircle2 className="w-3.5 h-3.5" /> : <CircleDashed className="w-3.5 h-3.5" />} {on ? 'Connected' : 'Not set up'}
      </span>
    </div>
    <p className="text-[11px] text-slate-600 mt-1.5">{on ? onText : offText}</p>
  </div>
);

export default BillingSettingsView;
