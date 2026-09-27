import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addDaysToIsoDate,
  applyLateFeeToInvoice,
  billingPeriodForSchedulingDay,
  nyTodayIso,
  runRentInvoiceScheduler,
  runRentLateFeeScheduler,
} from './rentBilling.js';
import { createMemoryStore } from './store.js';
import { LATE_FEE_CENTS } from './unitHealth.js';

test('billingPeriodForSchedulingDay returns February when today is Jan 22', () => {
  const period = billingPeriodForSchedulingDay(new Date('2026-01-22T17:00:00.000Z'));
  assert.deepEqual(period, { periodStart: '2026-02-01', periodEnd: '2026-02-28' });
});

test('billingPeriodForSchedulingDay returns null on non-scheduling days', () => {
  assert.equal(billingPeriodForSchedulingDay(new Date('2026-01-21T17:00:00.000Z')), null);
});

test('addDaysToIsoDate handles month boundaries', () => {
  assert.equal(addDaysToIsoDate('2026-01-22', 10), '2026-02-01');
});

test('runRentInvoiceScheduler creates invoices on scheduling day without Stripe', async () => {
  const store = createMemoryStore();
  const person = await store.upsertPerson({ displayName: 'Jordan', email: 'jordan@example.com' });
  await store.createLease({
    unitId: 'unit-124-w-cherokee-a',
    personId: person.id,
    startDate: '2026-01-01',
    endDate: '2027-01-01',
    rentCents: 145000,
  });

  const result = await runRentInvoiceScheduler(store, { RENT_PAYMENTS_ENABLED: 'false' }, new Date('2026-01-22T17:00:00.000Z'));
  assert.equal(result.skipped, false);
  assert.equal(result.created, 1);
  const invoices = await store.listInvoices();
  assert.equal(invoices.length, 1);
  assert.equal(invoices[0].periodStart, '2026-02-01');
});

test('runRentLateFeeScheduler applies late fee after grace', async () => {
  const store = createMemoryStore();
  const person = await store.upsertPerson({ displayName: 'Jordan', email: 'jordan@example.com' });
  const lease = await store.createLease({
    unitId: 'unit-124-w-cherokee-a',
    personId: person.id,
    startDate: '2026-01-01',
    endDate: '2027-01-01',
    rentCents: 145000,
  });
  await store.createInvoice({
    leaseId: lease.id,
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    amountCents: 145000,
  });

  const result = await runRentLateFeeScheduler(store, {}, new Date('2026-08-05T17:00:00.000Z'));
  assert.equal(result.skipped, false);
  assert.equal(result.applied, 1);
  const invoices = await store.listInvoices();
  assert.equal(invoices[0].amountCents, 145000 + LATE_FEE_CENTS);
});

test('applyLateFeeToInvoice is idempotent', async () => {
  const store = createMemoryStore();
  const person = await store.upsertPerson({ displayName: 'Jordan', email: 'jordan@example.com' });
  const lease = await store.createLease({
    unitId: 'unit-124-w-cherokee-b',
    personId: person.id,
    startDate: '2026-01-01',
    endDate: '2027-01-01',
    rentCents: 120000,
  });
  const invoice = await store.createInvoice({
    leaseId: lease.id,
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    amountCents: 120000,
  });
  const first = await applyLateFeeToInvoice(store, null, invoice, lease);
  const second = await applyLateFeeToInvoice(store, null, first.invoice, lease);
  assert.equal(first.applied, true);
  assert.equal(second.applied, false);
});

test('nyTodayIso uses America/New_York', () => {
  assert.match(nyTodayIso(new Date('2026-08-01T06:00:00.000Z')), /^\d{4}-\d{2}-\d{2}$/);
});
