/**
 * Billing mailer — emails invoices/quotes with a link to the public
 * client-facing page. Provider resolution:
 *   RESEND_API_KEY (+ BILLING_FROM_EMAIL)            -> Resend HTTP API
 *   SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS (+ from) -> nodemailer (dynamic import)
 *   otherwise                                         -> 'none' (mailto: fallback)
 */
import { store } from '../db/store.js';
import type { BillingDocument, BillingSettings } from '@openmsp/api-types';
import { BillingError, addHistory, computeDocument, docLabel, nowIso, settings } from './engine.js';

export type EmailProvider = 'resend' | 'smtp' | 'none';

export function emailProvider(): EmailProvider {
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.SMTP_HOST) return 'smtp';
  return 'none';
}

export function fromAddress(): string {
  const s = settings();
  const email = process.env.BILLING_FROM_EMAIL || s.companyEmail || process.env.SMTP_USER || 'billing@apexmsp.app';
  return email.includes('<') ? email : `${s.companyName || 'ApexMSP'} Billing <${email}>`;
}

export function portalBase(): string {
  const base = settings().publicPortalBaseUrl || process.env.PUBLIC_PORTAL_URL || 'https://console.apexmsp.app';
  return base.replace(/\/+$/, '');
}

export const publicUrlFor = (doc: BillingDocument): string => `${portalBase()}/invoice/${encodeURIComponent(doc.publicToken)}`;

/** Integration status fields merged into GET /billing/settings. */
export function integrationStatus(): Pick<BillingSettings, 'stripeConfigured' | 'emailConfigured' | 'emailProvider'> {
  const provider = emailProvider();
  return { stripeConfigured: !!process.env.STRIPE_SECRET_KEY, emailConfigured: provider !== 'none', emailProvider: provider };
}

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

function money(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(n || 0);
  } catch {
    return `$${(n || 0).toFixed(2)}`;
  }
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderDocumentEmail(doc: BillingDocument, opts: { subject?: string; message?: string } = {}): RenderedEmail {
  const s = settings();
  const label = docLabel(doc.type);
  const url = publicUrlFor(doc);
  const color = /^#[0-9a-f]{3,8}$/i.test(s.brandColor || '') ? s.brandColor! : '#2563eb';
  const company = s.companyName || 'ApexMSP';
  const isQuote = doc.type === 'quote';
  const amount = doc.type === 'invoice' ? doc.balanceDue : doc.total;
  const amountLabel = doc.type === 'invoice' ? 'Amount due' : doc.type === 'credit_note' ? 'Credit amount' : 'Total';
  const dateLabel = doc.type === 'invoice' ? 'Due date' : isQuote ? 'Valid until' : 'Date';
  const dateVal = doc.type === 'invoice' ? doc.dueDate : isQuote ? doc.expiryDate : doc.issueDate;
  const cta = doc.type === 'invoice' ? (doc.balanceDue > 0 ? 'View & Pay Invoice' : 'View Invoice') : isQuote ? 'View Quote' : `View ${label}`;
  const subject = opts.subject || `${label} ${doc.number} from ${company}`;
  const greeting = `Hello ${doc.clientName},`;
  const intro = doc.type === 'invoice'
    ? `Please find your invoice ${doc.number} from ${company} below.`
    : isQuote
      ? `${company} has prepared quote ${doc.number} for your review.`
      : `${company} has issued ${label.toLowerCase()} ${doc.number}.`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
<tr><td style="background:${color};padding:20px 28px;">
${s.logoUrl ? `<img src="${esc(s.logoUrl)}" alt="${esc(company)}" style="max-height:40px;display:block;">` : `<div style="font-size:20px;font-weight:700;color:#ffffff;">${esc(company)}</div>`}
</td></tr>
<tr><td style="padding:28px;">
<p style="margin:0 0 12px;font-size:15px;">${esc(greeting)}</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#334155;">${esc(intro)}</p>
${opts.message ? `<div style="margin:0 0 20px;padding:14px 16px;background:#f8fafc;border-left:3px solid ${color};font-size:14px;line-height:1.5;color:#334155;white-space:pre-wrap;">${esc(opts.message)}</div>` : ''}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e2e8f0;border-radius:8px;margin:0 0 24px;">
<tr><td style="padding:14px 16px;font-size:13px;color:#64748b;">${esc(label)} #</td><td align="right" style="padding:14px 16px;font-size:14px;font-weight:600;">${esc(doc.number)}</td></tr>
<tr><td style="padding:0 16px 14px;font-size:13px;color:#64748b;">${esc(amountLabel)}</td><td align="right" style="padding:0 16px 14px;font-size:22px;font-weight:700;color:${color};">${esc(money(amount, s.currency))}</td></tr>
${dateVal ? `<tr><td style="padding:0 16px 14px;font-size:13px;color:#64748b;">${esc(dateLabel)}</td><td align="right" style="padding:0 16px 14px;font-size:14px;">${esc(dateVal)}</td></tr>` : ''}
</table>
<table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:0 auto 24px;"><tr><td style="border-radius:8px;background:${color};">
<a href="${esc(url)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${esc(cta)}</a>
</td></tr></table>
<p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;text-align:center;">Or copy this link into your browser:<br><a href="${esc(url)}" style="color:#64748b;word-break:break-all;">${esc(url)}</a></p>
</td></tr>
<tr><td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;text-align:center;">
${esc(company)}${s.companyPhone ? ` · ${esc(s.companyPhone)}` : ''}${s.companyEmail ? ` · ${esc(s.companyEmail)}` : ''}
</td></tr></table></td></tr></table></body></html>`;

  const text = [
    greeting,
    '',
    intro,
    ...(opts.message ? ['', opts.message] : []),
    '',
    `${label} #: ${doc.number}`,
    `${amountLabel}: ${money(amount, s.currency)}`,
    ...(dateVal ? [`${dateLabel}: ${dateVal}`] : []),
    '',
    `${cta}: ${url}`,
    '',
    `Thank you,`,
    company
  ].join('\n');

  return { subject, html, text };
}

export interface MailMessage {
  to: string;
  cc?: string;
  subject: string;
  html: string;
  text: string;
}

/** Deliver an email via the configured provider. Throws on failure or when no provider is configured. */
export async function sendMail(msg: MailMessage): Promise<EmailProvider> {
  const provider = emailProvider();
  const from = fromAddress();
  const split = (s?: string) => (s || '').split(/[,;]/).map((x) => x.trim()).filter(Boolean);
  if (provider === 'resend') {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: split(msg.to),
        ...(msg.cc ? { cc: split(msg.cc) } : {}),
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        ...(settings().companyEmail ? { reply_to: settings().companyEmail } : {})
      })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Resend error ${res.status}: ${body.slice(0, 300)}`);
    }
    return provider;
  }
  if (provider === 'smtp') {
    let nodemailer: any;
    try {
      const modName = 'nodemailer';
      const mod: any = await import(modName);
      nodemailer = mod.default || mod;
    } catch {
      throw new Error('SMTP is configured but the nodemailer package is not installed');
    }
    const port = Number(process.env.SMTP_PORT) || 587;
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      ...(process.env.SMTP_USER ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } } : {})
    });
    await transport.sendMail({ from, to: msg.to, cc: msg.cc, subject: msg.subject, html: msg.html, text: msg.text });
    return provider;
  }
  throw new Error('No email provider configured');
}

export interface SendOptions {
  to?: string;
  cc?: string;
  subject?: string;
  message?: string;
}

export interface SendResult {
  sent: boolean;
  publicUrl: string;
  mailto?: string;
  document: BillingDocument;
  error?: string;
}

/**
 * Email a document (or produce a mailto fallback) and transition it to sent.
 * Invoices in pending_review are blocked unless `fromApprove` is set.
 */
export async function deliverDocument(doc: BillingDocument, opts: SendOptions, actor: string, fromApprove = false): Promise<SendResult> {
  if (doc.status === 'void') throw new BillingError(400, 'Cannot send a void document');
  if (doc.type === 'invoice' && doc.status === 'pending_review' && !fromApprove) {
    throw new BillingError(409, 'This invoice is pending review — approve it in Invoice Audit first');
  }
  const client = store.clients.get(doc.clientId);
  const to = (opts.to || doc.billingEmail || client?.billingEmail || client?.contactEmail || '').trim();
  const rendered = renderDocumentEmail(doc, opts);
  const publicUrl = publicUrlFor(doc);
  const provider = emailProvider();

  let sent = false;
  let error: string | undefined;
  if (!to) error = 'No recipient email address — add a billing email to the client';
  else if (provider === 'none') error = 'No email provider configured (set RESEND_API_KEY or SMTP_HOST)';
  else {
    try {
      await sendMail({ to, cc: opts.cc, subject: rendered.subject, html: rendered.html, text: rendered.text });
      sent = true;
    } catch (e) {
      error = (e as Error).message;
    }
  }

  // Transition status (mailto fallback still counts as "sent" — the user sends it from their mail client).
  if (doc.type === 'invoice' && (doc.status === 'draft' || doc.status === 'pending_review')) doc.status = 'sent';
  else if (doc.type === 'quote' && doc.status === 'draft') doc.status = 'sent';
  else if (doc.type === 'sales_order' && doc.status === 'draft') doc.status = 'confirmed';
  doc.sentAt = nowIso();
  computeDocument(doc);
  addHistory(doc, actor, 'sent', sent ? `Emailed to ${to}${opts.cc ? ` (cc ${opts.cc})` : ''} via ${provider}` : `Marked sent — ${error || 'mailto fallback'}`);

  const result: SendResult = { sent, publicUrl, document: doc };
  if (!sent) {
    const params = `subject=${encodeURIComponent(rendered.subject)}${opts.cc ? `&cc=${encodeURIComponent(opts.cc)}` : ''}&body=${encodeURIComponent(rendered.text)}`;
    result.mailto = `mailto:${encodeURIComponent(to).replace(/%40/g, '@')}?${params}`;
    if (error) result.error = error;
  }
  return result;
}
