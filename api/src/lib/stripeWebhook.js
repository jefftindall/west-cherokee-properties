import Stripe from 'stripe';
import { markInvoicePaid } from './invoices.js';
import { applyRentCheckoutEvent, isRentCheckoutEvent } from './rentPayments.js';
import { getStore } from './store.js';

export function stripeWebhookClient(secretKey) {
  return new Stripe(secretKey);
}

export function stripeReady(env = process.env) {
  return (
    rentPaymentsEnabled(env) &&
    String(env.STRIPE_SECRET_KEY || '').startsWith('sk_') &&
    !String(env.STRIPE_SECRET_KEY || '').includes('not_configured')
  );
}

export function verifyStripeWebhookEvent({ rawBody, signature, webhookSecret, stripe }) {
  const secret = String(webhookSecret || '').trim();
  if (!secret || secret === 'REPLACE_ME') {
    return { ok: false, status: 503, errorKind: 'config' };
  }
  try {
    const event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    return { ok: true, event };
  } catch {
    return { ok: false, status: 400, errorKind: 'signature' };
  }
}

export function stripeEventTelemetry(event) {
  return { eventId: event?.id, eventType: event?.type };
}

/** Legacy: Stripe Invoices created before portal Checkout. New charges never create Stripe invoices. */
export function extractPaidInvoice(event) {
  if (event?.type !== 'invoice.paid') return null;
  const obj = event?.data?.object || {};
  return {
    stripeInvoiceId: obj.id,
    amountCents: obj.amount_paid,
    paymentIntentId: typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.payment_intent?.id,
    receiptUrl: obj.charge?.receipt_url || obj.receipt_url || '',
  };
}

export function parseInvoiceIdsFromMetadata(metadata = {}) {
  const combined = String(metadata.wcp_invoice_ids || metadata.wcp_invoice_id || '').trim();
  if (!combined) return [];
  return [...new Set(combined.split(',').map((id) => id.trim()).filter(Boolean))];
}

async function applyLegacyInvoicePaid(event, store) {
  const paid = extractPaidInvoice(event);
  if (!paid?.stripeInvoiceId) return { applied: false, kind: 'ignored' };
  const invoice = await store.getInvoiceByStripeId(paid.stripeInvoiceId);
  if (!invoice) return { applied: false, kind: 'unmatched' };

  const invoiceIds = parseInvoiceIdsFromMetadata(event?.data?.object?.metadata || {});
  const targets = invoiceIds.length ? invoiceIds : [invoice.id];
  for (const invoiceId of targets) {
    const row = invoiceId === invoice.id ? invoice : await store.getInvoice(invoiceId);
    if (!row || row.status === 'paid') continue;
    await markInvoicePaid(store, row, {
      stripeEventId: `${event.id}:${invoiceId}`,
      stripePaymentIntentId: paid.paymentIntentId,
      receiptUrl: paid.receiptUrl,
    });
  }
  return { applied: true, kind: 'paid', invoiceCount: targets.length };
}

export async function applyStripeLedgerEvent(event, store = getStore(), stripe = null) {
  if (isRentCheckoutEvent(event)) return applyRentCheckoutEvent(event, store, stripe);
  if (event?.type === 'charge.refunded') {
    // Refunds are issued by staff in the Stripe Dashboard; staff adjust the SQL balance by hand.
    return { applied: false, kind: 'refund_needs_review' };
  }
  if (event?.type === 'invoice.paid') return applyLegacyInvoicePaid(event, store);
  return { applied: false, kind: 'ignored' };
}

export function rentPaymentsEnabled(env = process.env) {
  return String(env.RENT_PAYMENTS_ENABLED || '').toLowerCase() === 'true';
}

export function rentCommunicationsEnabled(env = process.env) {
  return String(env.RENT_COMMUNICATIONS_ENABLED || '').toLowerCase() === 'true';
}

export function rentCommunicationsPreview(env = process.env) {
  return String(env.RENT_COMMUNICATIONS_PREVIEW || '').toLowerCase() === 'true';
}
