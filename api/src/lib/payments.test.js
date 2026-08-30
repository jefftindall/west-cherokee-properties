import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryStore } from './store.js';
import {
  defaultPeriodForMonthInput,
  findInvoiceForPeriod,
  recordLeasePeriodPayment,
  recordManualPayment,
} from './payments.js';

test('defaultPeriodForMonthInput returns full calendar month', () => {
  assert.deepEqual(defaultPeriodForMonthInput('2026-08'), {
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
  });
});

test('recordManualPayment marks invoice paid and stores manual metadata', async () => {
  const store = createMemoryStore();
  const person = await store.upsertPerson({ displayName: 'Jordan', email: 'jordan@example.com' });
  const lease = await store.createLease({
    unitId: 'unit-124-w-cherokee-a',
    personId: person.id,
    startDate: '2026-01-01',
    endDate: '2027-01-01',
    rentCents: 145000,
  });
  const invoice = await store.createInvoice({
    leaseId: lease.id,
    periodStart: '2026-07-01',
    periodEnd: '2026-07-31',
    amountCents: 145000,
  });
  const result = await recordManualPayment(store, {
    invoice,
    method: 'check',
    notes: 'July back payment',
    recordedBy: 'staff@example.com',
    paidAt: '2026-07-15T12:00:00.000Z',
  });
  assert.equal(result.invoice.status, 'paid');
  assert.equal(result.payment.source, 'manual');
  assert.equal(result.payment.method, 'check');
  assert.equal(result.payment.notes, 'July back payment');
  assert.equal(result.payment.recordedBy, 'staff@example.com');
});

test('recordLeasePeriodPayment creates invoice for back month then records payment', async () => {
  const store = createMemoryStore();
  const person = await store.upsertPerson({ displayName: 'Riley', email: 'riley@example.com' });
  const lease = await store.createLease({
    unitId: 'unit-124-w-cherokee-b',
    personId: person.id,
    startDate: '2026-01-01',
    endDate: '2027-01-01',
    rentCents: 120000,
    terms: { petCount: 1 },
  });
  const result = await recordLeasePeriodPayment(store, {
    lease,
    periodStart: '2026-06-01',
    periodEnd: '2026-06-30',
    method: 'zelle',
    recordedBy: 'staff@example.com',
  });
  assert.equal(result.invoice.status, 'paid');
  assert.equal(result.invoice.amountCents, 122000);
  const invoices = await store.listInvoices();
  assert.equal(findInvoiceForPeriod(invoices, lease.id, '2026-06-01', '2026-06-30')?.status, 'paid');
});

test('recordManualPayment rejects already paid invoice', async () => {
  const store = createMemoryStore();
  const person = await store.upsertPerson({ displayName: 'Sam', email: 'sam@example.com' });
  const lease = await store.createLease({
    unitId: 'unit-11-noble',
    personId: person.id,
    startDate: '2026-01-01',
    endDate: '2027-01-01',
    rentCents: 110000,
  });
  const invoice = await store.createInvoice({
    leaseId: lease.id,
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    amountCents: 110000,
    status: 'paid',
  });
  await assert.rejects(
    () =>
      recordManualPayment(store, {
        invoice,
        method: 'cash',
        recordedBy: 'staff@example.com',
      }),
    (err) => err.name === 'ConflictError',
  );
});
