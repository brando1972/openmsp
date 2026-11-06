/**
 * /api/v1/public/invoices — unauthenticated client-facing invoice/quote page.
 * Documents are addressed only by their unguessable publicToken.
 */
import { Router, type Response, type Request } from 'express';
import { store } from '../db/store.js';
import type { BillingDocument, PublicInvoiceView } from '@openmsp/api-types';
import { BillingError, OPEN_INVOICE_STATUSES, addHistory, nowIso, today } from '../billing/engine.js';
import { createCheckoutSession, stripeConfigured } from '../billing/stripe.js';

const router = Router();

const HIDDEN: BillingDocument['status'][] = ['draft', 'pending_review'];

function findByToken(token: string): BillingDocument {
  if (!token || token.length < 16) throw new BillingError(404, 'Document not found');
  for (const d of store.billingDocuments.values()) {
    if (d.publicToken === token) {
      if (HIDDEN.includes(d.status)) break;
      return d;
    }
  }
  throw new BillingError(404, 'Document not found');
}

function toView(doc: BillingDocument): PublicInvoiceView {
  const s = store.billingSettings;
  const client = store.clients.get(doc.clientId);
  // Strip internal-only fields before exposing publicly.
  const { auditFlags: _a, auditApprovedBy: _b, auditApprovedAt: _c, createdBy: _d, history: _e, ...rest } = doc;
  const taxIds = new Set<string>();
  for (const l of doc.lines) if (l.taxRateId) taxIds.add(l.taxRateId);
  if (client?.taxRateId) taxIds.add(client.taxRateId);
  const taxRates = Array.from(store.taxRates.values()).filter((t) => taxIds.has(t.id) || t.isDefault);
  return {
    document: {
      ...rest,
      history: [],
      createdBy: '',
      lines: doc.lines.map(({ sourceRef: _s, ...l }) => l)
    },
    company: {
      companyName: s.companyName,
      companyEmail: s.companyEmail,
      companyPhone: s.companyPhone,
      companyWebsite: s.companyWebsite,
      companyAddress: s.companyAddress,
      logoUrl: s.logoUrl,
      brandColor: s.brandColor,
      currency: s.currency
    },
    client: {
      name: client?.name || doc.clientName,
      billingAddress: client?.billingAddress,
      contactName: client?.contactName || ''
    },
    taxRates,
    payOnlineAvailable: stripeConfigured() && doc.type === 'invoice' && OPEN_INVOICE_STATUSES.includes(doc.status) && doc.balanceDue >= 0.5
  };
}

type Handler = (req: Request, res: Response) => unknown | Promise<unknown>;
const h = (fn: Handler) => async (req: Request, res: Response) => {
  try {
    await fn(req, res);
  } catch (e) {
    if (e instanceof BillingError) {
      res.status(e.status).json({ error: e.message });
      return;
    }
    console.error('[public-invoices] error:', e);
    res.status(500).json({ error: 'Internal error' });
  }
};
const tokenOf = (req: Request) => String((req.params as Record<string, unknown>).token ?? '');

router.get('/:token', h((req, res) => {
  const doc = findByToken(tokenOf(req));
  const last = doc.lastViewedAt ? Date.parse(doc.lastViewedAt) : 0;
  if (!last || Date.now() - last > 60 * 60 * 1000) {
    addHistory(doc, doc.clientName || 'Client', 'viewed', `Viewed from ${req.ip || 'unknown IP'}`);
  }
  doc.lastViewedAt = nowIso();
  res.json(toView(doc));
}));

router.post('/:token/checkout', h(async (req, res) => {
  const doc = findByToken(tokenOf(req));
  if (doc.type !== 'invoice') throw new BillingError(400, 'Online payment is only available for invoices');
  const url = await createCheckoutSession(doc);
  addHistory(doc, doc.clientName || 'Client', 'checkout_started', 'Client opened Stripe Checkout');
  store.recordAudit({
    orgId: doc.orgId, actorName: doc.clientName || 'Client', action: 'billing.public_checkout', targetType: 'billing_document',
    targetId: doc.id, details: { number: doc.number, amount: doc.balanceDue }, ipAddress: req.ip
  });
  res.json({ url });
}));

router.post('/:token/respond', h((req, res) => {
  const doc = findByToken(tokenOf(req));
  if (doc.type !== 'quote') throw new BillingError(400, 'Only quotes can be accepted or declined');
  if (doc.status !== 'sent') throw new BillingError(400, `This quote is ${doc.status} and can no longer be ${req.body?.accept ? 'accepted' : 'declined'}`);
  if (typeof req.body?.accept !== 'boolean') throw new BillingError(400, 'accept (boolean) is required');
  if (doc.expiryDate && doc.expiryDate < today()) {
    doc.status = 'expired';
    addHistory(doc, 'Billing', 'expired', `Quote expired on ${doc.expiryDate}`);
    throw new BillingError(400, 'This quote has expired — please contact us for an updated quote');
  }
  const accept = req.body.accept as boolean;
  doc.status = accept ? 'accepted' : 'declined';
  addHistory(doc, doc.clientName || 'Client', accept ? 'accepted' : 'declined', `Client ${accept ? 'accepted' : 'declined'} the quote online`);
  store.recordAudit({
    orgId: doc.orgId, actorName: doc.clientName || 'Client', action: accept ? 'billing.quote_accept' : 'billing.quote_decline',
    targetType: 'billing_document', targetId: doc.id, details: { number: doc.number }, ipAddress: req.ip
  });
  store.persist();
  res.json(toView(doc));
}));

export default router;
