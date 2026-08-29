import Stripe from 'stripe';
import { markInvoicePaid } from './invoices.js';
import { getStore } from './store.js';

export function stripeWebhookClient(secretKey) {
  return new Stripe(secretKey);
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

export function extractPaidInvoice(event) {
  const type = event?.type;
  const obj = event?.data?.object || {};
  if (type === 'invoice.paid') {
    return {
      stripeInvoiceId: obj.id,
      amountCents: obj.amount_paid,
      paymentIntentId: typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.payment_intent?.id,
      hostedInvoiceUrl: obj.hosted_invoice_url || '',
      receiptUrl: obj.charge?.receipt_url || obj.receipt_url || '',
    };
  }
  if (type === 'checkout.session.completed' && obj.invoice) {
    return {
      stripeInvoiceId: typeof obj.invoice === 'string' ? obj.invoice : obj.invoice.id,
      amountCents: obj.amount_total,
      paymentIntentId: typeof obj.payment_intent === 'string' ? obj.payment_intent : '',
      hostedInvoiceUrl: '',
      receiptUrl: '',
    };
  }
  return null;
}

export async function applyStripeLedgerEvent(event, store = getStore()) {
  if (event?.type === 'invoice.payment_failed') {
    const stripeInvoiceId = event.data?.object?.id;
    const invoice = stripeInvoiceId ? await store.getInvoiceByStripeId(stripeInvoiceId) : null;
    if (invoice) await store.updateInvoice(invoice.id, { status: 'past_due' });
    return { applied: Boolean(invoice), kind: 'failed' };
  }
  if (event?.type === 'charge.refunded') {
    const stripeInvoiceId = event.data?.object?.invoice;
    const invoice = stripeInvoiceId ? await store.getInvoiceByStripeId(stripeInvoiceId) : null;
    if (invoice) await store.updateInvoice(invoice.id, { status: 'refunded' });
    return { applied: Boolean(invoice), kind: 'refunded' };
  }
  const paid = extractPaidInvoice(event);
  if (!paid?.stripeInvoiceId) return { applied: false, kind: 'ignored' };
  const invoice = await store.getInvoiceByStripeId(paid.stripeInvoiceId);
  if (!invoice) return { applied: false, kind: 'unmatched' };
  await markInvoicePaid(store, invoice, {
    amountCents: paid.amountCents,
    stripeEventId: event.id,
    stripePaymentIntentId: paid.paymentIntentId,
    receiptUrl: paid.receiptUrl,
  });
  if (paid.hostedInvoiceUrl) {
    await store.updateInvoice(invoice.id, { hostedInvoiceUrl: paid.hostedInvoiceUrl });
  }
  return { applied: true, kind: 'paid' };
}

export function rentPaymentsEnabled(env = process.env) {
  return String(env.RENT_PAYMENTS_ENABLED || '').toLowerCase() === 'true';
}

/**
 * Create a Stripe Invoice for an app invoice. Omits payment_method_types
 * so Dashboard-configured methods appear dynamically.
 */
export async function createStripeInvoiceForRow({ stripe, customerId, appInvoice, siteUrl }) {
  const invoice = await stripe.invoices.create({
    customer: customerId,
    collection_method: 'send_invoice',
    days_until_due: 14,
    metadata: { wcp_invoice_id: appInvoice.id, wcp_lease_id: appInvoice.leaseId },
  });
  await stripe.invoiceItems.create({
    customer: customerId,
    invoice: invoice.id,
    amount: appInvoice.amountCents,
    currency: 'usd',
    description: `Rent ${appInvoice.periodStart} – ${appInvoice.periodEnd}`,
  });
  const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
  return {
    stripeInvoiceId: finalized.id,
    hostedInvoiceUrl: finalized.hosted_invoice_url || `${siteUrl}/portal/invoices`,
  };
}
