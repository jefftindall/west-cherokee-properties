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
  return {
    id: input.id,
    leaseId,
    periodStart,
    periodEnd,
    amountCents,
    status: input.status || 'open',
    stripeInvoiceId: input.stripeInvoiceId || '',
    hostedInvoiceUrl: input.hostedInvoiceUrl || '',
    receiptUrl: input.receiptUrl || '',
  };
}

export function invoiceOwnedByPerson(invoice, leases, personId) {
  const lease = (leases || []).find((row) => row.id === invoice.leaseId);
  return Boolean(lease && lease.personId === personId);
}

export async function markInvoicePaid(store, invoice, paymentInput) {
  const payment = await store.createPayment({
    invoiceId: invoice.id,
    amountCents: paymentInput.amountCents ?? invoice.amountCents,
    stripeEventId: paymentInput.stripeEventId || '',
    stripePaymentIntentId: paymentInput.stripePaymentIntentId || '',
    receiptUrl: paymentInput.receiptUrl || '',
  });
  const updated = await store.updateInvoice(invoice.id, {
    status: 'paid',
    receiptUrl: payment.receiptUrl || invoice.receiptUrl,
  });
  return { invoice: updated, payment };
}
