export function normalizeInvoice(input) {
  const leaseId = String(input.leaseId || '').trim();
  const periodStart = String(input.periodStart || '').trim();
  const periodEnd = String(input.periodEnd || '').trim();
  const amountCents = Number(input.amountCents);
  if (!leaseId || !periodStart || !periodEnd) {
    const err = new Error('leaseId, periodStart, and periodEnd are required');
    err.name = 'ValidationError';
    throw err;
  }
  if (!Number.isInteger(amountCents) || amountCents < 1) {
    const err = new Error('amountCents must be a positive integer');
    err.name = 'ValidationError';
    throw err;
  }
  const status = input.status || 'open';
  return {
    id: input.id,
    leaseId,
    periodStart,
    periodEnd,
    amountCents,
    paidCents: status === 'paid' ? Math.max(Number(input.paidCents) || 0, amountCents) : Number(input.paidCents) || 0,
    status,
    stripeInvoiceId: input.stripeInvoiceId || '',
    hostedInvoiceUrl: input.hostedInvoiceUrl || '',
    receiptUrl: input.receiptUrl || '',
  };
}

export function invoicePaidCents(invoice) {
  if (!invoice) return 0;
  if (invoice.status === 'paid') return Math.max(Number(invoice.paidCents) || 0, Number(invoice.amountCents) || 0);
  return Number(invoice.paidCents) || 0;
}

export function invoiceRemainingCents(invoice) {
  if (!invoice || invoice.status === 'paid') return 0;
  return Math.max(0, Number(invoice.amountCents) - invoicePaidCents(invoice));
}

export function invoiceOwnedByPerson(invoice, leases, personId) {
  const lease = (leases || []).find((row) => row.id === invoice.leaseId);
  return Boolean(lease && lease.personId === personId);
}

/** Apply up to the invoice's remaining balance. Marks the invoice paid once fully covered. */
export async function applyPaymentToInvoice(store, invoice, paymentInput) {
  const remaining = invoiceRemainingCents(invoice);
  const amountCents = Number(paymentInput.amountCents ?? remaining);
  if (!Number.isInteger(amountCents) || amountCents < 1 || amountCents > remaining) {
    const err = new Error(`Payment must be between $0.01 and the remaining $${(remaining / 100).toFixed(2)}.`);
    err.name = 'ValidationError';
    throw err;
  }
  const payment = await store.createPayment({
    invoiceId: invoice.id,
    amountCents,
    stripeEventId: paymentInput.stripeEventId || '',
    stripePaymentIntentId: paymentInput.stripePaymentIntentId || '',
    receiptUrl: paymentInput.receiptUrl || '',
    source: paymentInput.source || 'stripe',
    method: paymentInput.method || '',
    notes: paymentInput.notes || '',
    recordedBy: paymentInput.recordedBy || '',
    createdAt: paymentInput.createdAt,
  });
  const paidCents = invoicePaidCents(invoice) + amountCents;
  const updated = await store.updateInvoice(invoice.id, {
    paidCents,
    status: paidCents >= Number(invoice.amountCents) ? 'paid' : invoice.status,
    receiptUrl: payment.receiptUrl || invoice.receiptUrl,
  });
  return { invoice: updated, payment };
}

export async function markInvoicePaid(store, invoice, paymentInput) {
  return applyPaymentToInvoice(store, invoice, { ...paymentInput, amountCents: invoiceRemainingCents(invoice) });
}
