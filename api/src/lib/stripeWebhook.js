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

  const metadata = event?.data?.object?.metadata || {};
  const invoiceIds = parseInvoiceIdsFromMetadata(metadata);
  const targets = invoiceIds.length ? invoiceIds : [invoice.id];

  for (const invoiceId of targets) {
    const row = invoiceId === invoice.id ? invoice : await store.getInvoice(invoiceId);
    if (!row || row.status === 'paid') continue;
    await markInvoicePaid(store, row, {
      amountCents: row.amountCents,
      stripeEventId: `${event.id}:${invoiceId}`,
      stripePaymentIntentId: paid.paymentIntentId,
      receiptUrl: paid.receiptUrl,
    });
  }

  if (paid.hostedInvoiceUrl) {
    await store.updateInvoice(invoice.id, { hostedInvoiceUrl: paid.hostedInvoiceUrl });
  }
  return { applied: true, kind: 'paid', invoiceCount: targets.length };
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

function dueDateUnixForPeriodStart(periodStart) {
  const [year, month] = String(periodStart).split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, 1, 17, 0, 0) / 1000);
}

function invoiceIdsMetadata(primaryId, priorOpenInvoices = []) {
  const ids = [primaryId, ...priorOpenInvoices.map((row) => row.id)].filter(Boolean);
  return [...new Set(ids)].join(',');
}

/**
 * Create a Stripe Invoice for an app invoice. Omits payment_method_types
 * so Dashboard-configured methods appear dynamically. Does not email the tenant
 * (WCP comms scheduler is the sole tenant email path).
 */
export async function createStripeInvoiceForRow({
  stripe,
  customerId,
  appInvoice,
  priorOpenInvoices = [],
  siteUrl,
}) {
  const dueDate = dueDateUnixForPeriodStart(appInvoice.periodStart);
  const invoice = await stripe.invoices.create({
    customer: customerId,
    collection_method: 'send_invoice',
    auto_advance: false,
    due_date: dueDate,
    metadata: {
      wcp_invoice_id: appInvoice.id,
      wcp_invoice_ids: invoiceIdsMetadata(appInvoice.id, priorOpenInvoices),
      wcp_lease_id: appInvoice.leaseId,
    },
  });

  await stripe.invoiceItems.create({
    customer: customerId,
    invoice: invoice.id,
    amount: appInvoice.amountCents,
    currency: 'usd',
    description: `Rent ${appInvoice.periodStart} – ${appInvoice.periodEnd}`,
  });

  for (const prior of priorOpenInvoices) {
    await stripe.invoiceItems.create({
      customer: customerId,
      invoice: invoice.id,
      amount: prior.amountCents,
      currency: 'usd',
      description: `Prior balance ${prior.periodStart}`,
      metadata: { wcp_invoice_id: prior.id },
    });
  }

  const finalized = await stripe.invoices.finalizeInvoice(invoice.id, { auto_advance: false });
  return {
    stripeInvoiceId: finalized.id,
    hostedInvoiceUrl: finalized.hosted_invoice_url || `${siteUrl}/portal/invoices`,
  };
}

export function parseInvoiceIdsFromMetadata(metadata = {}) {
  const combined = String(metadata.wcp_invoice_ids || metadata.wcp_invoice_id || '').trim();
  if (!combined) return [];
  return [...new Set(combined.split(',').map((id) => id.trim()).filter(Boolean))];
}
