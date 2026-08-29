import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryStore } from './store.js';
import { invoiceOwnedByPerson, markInvoicePaid } from './invoices.js';

test('portal isolation: invoices belong only to the lease holder', async () => {
  const store = createMemoryStore();
  const jordan = await store.upsertPerson({ displayName: 'Jordan', email: 'jordan@example.com' });
  const riley = await store.upsertPerson({ displayName: 'Riley', email: 'riley@example.com' });
  const lease = await store.createLease({
    unitId: 'unit-124-w-cherokee-a',
    personId: jordan.id,
    startDate: '2026-09-01',
    endDate: '2027-08-31',
    rentCents: 145000,
  });
  const invoice = await store.createInvoice({
    leaseId: lease.id,
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    amountCents: 145000,
  });
  const leases = await store.getLeasesForPerson(jordan.id);
  assert.equal(invoiceOwnedByPerson(invoice, leases, jordan.id), true);
  assert.equal(invoiceOwnedByPerson(invoice, await store.getLeasesForPerson(riley.id), riley.id), false);
});

test('markInvoicePaid is idempotent on stripe event id', async () => {
  const store = createMemoryStore();
  const person = await store.upsertPerson({ displayName: 'Jordan', email: 'jordan@example.com' });
  const lease = await store.createLease({
    unitId: 'unit-124-w-cherokee-b',
    personId: person.id,
    startDate: '2026-09-01',
    endDate: '2027-08-31',
    rentCents: 120000,
  });
  const invoice = await store.createInvoice({
    leaseId: lease.id,
    periodStart: '2026-10-01',
    periodEnd: '2026-10-31',
    amountCents: 120000,
  });
  await markInvoicePaid(store, invoice, {
    amountCents: 120000,
    stripeEventId: 'evt_1',
    receiptUrl: 'https://stripe.test/receipt',
  });
  await markInvoicePaid(store, invoice, {
    amountCents: 120000,
    stripeEventId: 'evt_1',
    receiptUrl: 'https://stripe.test/receipt',
  });
  const payments = await store.listPayments(invoice.id);
  assert.equal(payments.length, 1);
  const paid = await store.getInvoice(invoice.id);
  assert.equal(paid.status, 'paid');
  assert.equal(paid.receiptUrl, 'https://stripe.test/receipt');
});
