import { monthlyChargeCents } from './leaseTerms.js';
import { applyPaymentToInvoice, invoiceRemainingCents } from './invoices.js';
import { monthPeriodForOffset } from './unitHealth.js';

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

/** Staff-recorded payment (cash, check, Zelle, ...). Partial amounts are allowed, up to the remaining balance. */
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
  const remaining = invoiceRemainingCents(invoice);
  const paymentAmount = Number(amountCents ?? remaining);
  if (!Number.isInteger(paymentAmount) || paymentAmount < 1) {
    const err = new Error('amountCents must be a positive integer');
    err.name = 'ValidationError';
    throw err;
  }
  if (paymentAmount > remaining) {
    const err = new Error(`Amount is more than the remaining $${(remaining / 100).toFixed(2)} on this invoice.`);
    err.name = 'ValidationError';
    throw err;
  }

  const { invoice: updated, payment } = await applyPaymentToInvoice(store, invoice, {
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

  const invoice = await ensureInvoiceForLeasePeriod(store, lease, periodStart, periodEnd);

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
