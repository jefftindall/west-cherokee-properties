import { monthlyChargeCents } from './leaseTerms.js';
import { markInvoicePaid } from './invoices.js';
import { monthPeriodForOffset } from './unitHealth.js';
import { rentPaymentsEnabled, stripeWebhookClient } from './stripeWebhook.js';

export const MANUAL_PAYMENT_METHODS = ['cash', 'check', 'zelle', 'ach', 'other'];

export function isManualPaymentMethod(method) {
  return MANUAL_PAYMENT_METHODS.includes(String(method || '').trim().toLowerCase());
}

export function findInvoiceForPeriod(invoices, leaseId, periodStart, periodEnd) {
  return (invoices || []).find(
    (invoice) =>
      invoice.leaseId === leaseId &&
      invoice.periodStart === periodStart &&
      invoice.periodEnd === periodEnd,
  );
}

export async function ensureInvoiceForLeasePeriod(store, lease, periodStart, periodEnd) {
  const invoices = await store.listInvoices();
  const existing = findInvoiceForPeriod(invoices, lease.id, periodStart, periodEnd);
  if (existing) return existing;
  return store.createInvoice({
    leaseId: lease.id,
    periodStart,
    periodEnd,
    amountCents: monthlyChargeCents(lease.rentCents, lease.terms?.petCount),
  });
}

async function markStripeInvoicePaidOutOfBand(invoice) {
  const stripeInvoiceId = String(invoice.stripeInvoiceId || '').trim();
  if (!stripeInvoiceId) return;
  if (!rentPaymentsEnabled() || !process.env.STRIPE_SECRET_KEY?.startsWith('sk_')) return;
  if (process.env.STRIPE_SECRET_KEY.includes('not_configured')) return;
  const stripe = stripeWebhookClient(process.env.STRIPE_SECRET_KEY);
  await stripe.invoices.pay(stripeInvoiceId, { paid_out_of_band: true });
}

export async function recordManualPayment(store, {
  invoice,
  amountCents,
  method,
  notes,
  recordedBy,
  paidAt,
}) {
  if (!invoice) {
    const err = new Error('Invoice not found.');
    err.name = 'NotFoundError';
    throw err;
  }
  if (invoice.status === 'paid') {
    const err = new Error('This invoice is already paid.');
    err.name = 'ConflictError';
    throw err;
  }
  if (!isManualPaymentMethod(method)) {
    const err = new Error(`method must be one of: ${MANUAL_PAYMENT_METHODS.join(', ')}`);
    err.name = 'ValidationError';
    throw err;
  }
  const paymentAmount = Number(amountCents ?? invoice.amountCents);
  if (!Number.isInteger(paymentAmount) || paymentAmount < 1) {
    const err = new Error('amountCents must be a positive integer');
    err.name = 'ValidationError';
    throw err;
  }
  if (paymentAmount !== Number(invoice.amountCents)) {
    const err = new Error('Partial payments are not supported yet. Amount must match the invoice total.');
    err.name = 'ValidationError';
    throw err;
  }

  await markStripeInvoicePaidOutOfBand(invoice);

  const { invoice: updated, payment } = await markInvoicePaid(store, invoice, {
    amountCents: paymentAmount,
    source: 'manual',
    method,
    notes: String(notes || '').trim(),
    recordedBy: String(recordedBy || '').trim(),
    createdAt: paidAt || new Date().toISOString(),
  });
  return { invoice: updated, payment };
}

export async function recordLeasePeriodPayment(store, {
  lease,
  periodStart,
  periodEnd,
  method,
  notes,
  recordedBy,
  paidAt,
  amountCents,
  createStripeInvoice = false,
}) {
  if (!lease || lease.status !== 'active') {
    const err = new Error('An active lease is required.');
    err.name = 'ValidationError';
    throw err;
  }
  if (lease.startDate > periodEnd || lease.endDate < periodStart) {
    const err = new Error('The selected period is outside the lease term.');
    err.name = 'ValidationError';
    throw err;
  }

  let invoice = await ensureInvoiceForLeasePeriod(store, lease, periodStart, periodEnd);

  if (
    createStripeInvoice &&
    !invoice.stripeInvoiceId &&
    rentPaymentsEnabled() &&
    process.env.STRIPE_SECRET_KEY?.startsWith('sk_') &&
    !process.env.STRIPE_SECRET_KEY.includes('not_configured')
  ) {
    const { createStripeInvoiceForRow } = await import('./stripeWebhook.js');
    const stripe = stripeWebhookClient(process.env.STRIPE_SECRET_KEY);
    const person = await store.getPerson(lease.personId);
    let customerId = String(person.stripeCustomerId || '').trim();
    if (!customerId) {
      const customer = await stripe.customers.create({ email: person.email, name: person.displayName });
      customerId = customer.id;
      await store.updatePersonStripeCustomerId(person.id, customerId);
    }
    const stripeInv = await createStripeInvoiceForRow({
      stripe,
      customerId,
      appInvoice: invoice,
      siteUrl: process.env.SITE_URL || 'https://westcherokee.com',
    });
    invoice = await store.updateInvoice(invoice.id, stripeInv);
  }

  return recordManualPayment(store, {
    invoice,
    amountCents,
    method,
    notes,
    recordedBy,
    paidAt,
  });
}

export function defaultPeriodForMonthInput(monthValue) {
  const trimmed = String(monthValue || '').trim();
  if (!/^\d{4}-\d{2}$/.test(trimmed)) {
    const err = new Error('month must be YYYY-MM');
    err.name = 'ValidationError';
    throw err;
  }
  const [year, month] = trimmed.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    periodStart: `${year}-${String(month).padStart(2, '0')}-01`,
    periodEnd: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function currentAndNextMonthInputs(date = new Date()) {
  return {
    current: monthPeriodForOffset(0, date),
    next: monthPeriodForOffset(1, date),
  };
}
