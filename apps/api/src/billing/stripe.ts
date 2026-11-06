/**
 * Stripe integration without the SDK: Checkout Session creation via REST
 * (form-encoded) and webhook signature verification + payment recording.
 */
import crypto from 'crypto';
import type { Request, Response } from 'express';
import { store } from '../db/store.js';
import type { BillingDocument } from '@openmsp/api-types';
import { BillingError, OPEN_INVOICE_STATUSES, addHistory, recordPayment, round2 } from './engine.js';
import { portalBase } from './mailer.js';

export const stripeConfigured = (): boolean => !!process.env.STRIPE_SECRET_KEY;

/** Create a Stripe Checkout Session for an invoice's balance and store its URL on the doc. */
export async function createCheckoutSession(doc: BillingDocument): Promise<string> {
  if (!stripeConfigured()) throw new BillingError(400, 'Stripe is not configured — set STRIPE_SECRET_KEY on the API server to accept online payments');
  if (doc.type !== 'invoice') throw new BillingError(400, 'Online payment is only available for invoices');
  if (!OPEN_INVOICE_STATUSES.includes(doc.status)) throw new BillingError(400, `Invoice is ${doc.status} and cannot be paid online`);
  const cents = Math.round(round2(doc.balanceDue) * 100);
  if (cents < 50) throw new BillingError(400, 'Invoice balance is too small to pay online');
  const currency = (store.billingSettings.currency || 'USD').toLowerCase();
  const base = `${portalBase()}/invoice/${encodeURIComponent(doc.publicToken)}`;

  const form = new URLSearchParams();
  form.append('mode', 'payment');
  form.append('payment_method_types[0]', 'card');
  if (currency === 'usd') form.append('payment_method_types[1]', 'us_bank_account');
  form.append('line_items[0][quantity]', '1');
  form.append('line_items[0][price_data][currency]', currency);
  form.append('line_items[0][price_data][unit_amount]', String(cents));
  form.append('line_items[0][price_data][product_data][name]', `Invoice ${doc.number}`);
  form.append('line_items[0][price_data][product_data][description]', `${store.billingSettings.companyName || 'ApexMSP'} — ${doc.clientName}`);
  form.append('metadata[invoiceId]', doc.id);
  form.append('metadata[token]', doc.publicToken);
  form.append('payment_intent_data[metadata][invoiceId]', doc.id);
  form.append('payment_intent_data[metadata][invoiceNumber]', doc.number);
  form.append('client_reference_id', doc.id);
  form.append('success_url', `${base}?paid=1`);
  form.append('cancel_url', `${base}?canceled=1`);
  const client = store.clients.get(doc.clientId);
  if (client?.stripeCustomerId) form.append('customer', client.stripeCustomerId);
  else if (doc.billingEmail) form.append('customer_email', doc.billingEmail);

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form.toString()
  });
  const body = (await res.json().catch(() => ({}))) as { url?: string; id?: string; error?: { message?: string } };
  if (!res.ok || !body.url) throw new BillingError(502, `Stripe error: ${body.error?.message || `HTTP ${res.status}`}`);
  doc.stripeCheckoutUrl = body.url;
  doc.updatedAt = new Date().toISOString();
  return body.url;
}

/** Verify a `Stripe-Signature` header (v1 HMAC-SHA256 over `${t}.${payload}`, 5 min tolerance). */
export function verifyStripeSignature(payload: Buffer | string, header: string | undefined, secret: string, toleranceSec = 300): boolean {
  if (!header) return false;
  let t = '';
  const sigs: string[] = [];
  for (const part of header.split(',')) {
    const [k, v] = part.split('=');
    if (k?.trim() === 't') t = (v || '').trim();
    else if (k?.trim() === 'v1' && v) sigs.push(v.trim());
  }
  if (!t || !sigs.length) return false;
  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${payload.toString()}`).digest();
  return sigs.some((s) => {
    const buf = Buffer.from(s, 'hex');
    return buf.length === expected.length && crypto.timingSafeEqual(buf, expected);
  });
}

interface StripeSession {
  id: string;
  amount_total?: number;
  payment_status?: string;
  payment_intent?: string | { id?: string };
  payment_method_types?: string[];
  metadata?: Record<string, string>;
  client_reference_id?: string;
}

function recordSessionPayment(session: StripeSession, method: 'stripe_card' | 'stripe_ach'): string {
  for (const p of store.billingPayments.values()) {
    if (p.stripeSessionId === session.id) return 'duplicate';
  }
  const invoiceId = session.metadata?.invoiceId || session.client_reference_id;
  const inv = invoiceId ? store.billingDocuments.get(invoiceId) : undefined;
  if (!inv || inv.type !== 'invoice') return 'invoice_not_found';
  const amount = round2((Number(session.amount_total) || 0) / 100);
  if (amount <= 0) return 'zero_amount';
  const piId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  const allocAmount = OPEN_INVOICE_STATUSES.includes(inv.status) ? Math.min(amount, inv.balanceDue) : 0;
  const payment = recordPayment(
    {
      clientId: inv.clientId,
      amount,
      method,
      reference: piId || session.id,
      notes: `Stripe Checkout payment for ${inv.number}`,
      allocations: allocAmount > 0 ? [{ invoiceId: inv.id, amount: allocAmount }] : [],
      stripeSessionId: session.id,
      ...(piId ? { stripePaymentIntentId: piId } : {})
    },
    'Stripe',
    inv.orgId
  );
  store.recordAudit({
    orgId: inv.orgId, actorName: 'Stripe', action: 'billing.payment_stripe', targetType: 'billing_payment',
    targetId: payment.id, details: { invoiceId: inv.id, amount, method, sessionId: session.id }
  });
  store.persist();
  return 'recorded';
}

/** Express handler for POST /api/v1/billing/stripe/webhook (mount with express.raw). */
export function stripeWebhookHandler(req: Request, res: Response): void {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    res.status(400).json({ error: 'STRIPE_WEBHOOK_SECRET is not configured' });
    return;
  }
  const raw: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));
  if (!verifyStripeSignature(raw, req.header('stripe-signature'), secret)) {
    res.status(400).json({ error: 'Invalid Stripe signature' });
    return;
  }
  let event: { type?: string; data?: { object?: StripeSession } };
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    res.status(400).json({ error: 'Invalid JSON payload' });
    return;
  }
  const session = event.data?.object;
  try {
    if (session && event.type === 'checkout.session.completed') {
      if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
        const types = session.payment_method_types || [];
        const method = types.length === 1 && types[0] === 'us_bank_account' ? 'stripe_ach' : 'stripe_card';
        res.json({ received: true, result: recordSessionPayment(session, method) });
        return;
      }
      // ACH debits complete asynchronously — note it on the invoice and wait for async_payment_succeeded.
      const inv = store.billingDocuments.get(session.metadata?.invoiceId || session.client_reference_id || '');
      if (inv) addHistory(inv, 'Stripe', 'payment_processing', 'Bank (ACH) payment initiated — awaiting settlement');
      res.json({ received: true, result: 'pending' });
      return;
    }
    if (session && event.type === 'checkout.session.async_payment_succeeded') {
      res.json({ received: true, result: recordSessionPayment(session, 'stripe_ach') });
      return;
    }
    if (session && event.type === 'checkout.session.async_payment_failed') {
      const inv = store.billingDocuments.get(session.metadata?.invoiceId || session.client_reference_id || '');
      if (inv) addHistory(inv, 'Stripe', 'payment_failed', 'Bank (ACH) payment failed');
      res.json({ received: true, result: 'failed' });
      return;
    }
    res.json({ received: true, ignored: event.type });
  } catch (e) {
    console.warn('[billing] stripe webhook error:', (e as Error).message);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}
