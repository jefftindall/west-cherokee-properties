import assert from 'node:assert/strict';
import test from 'node:test';
import { runInvoiceCatchUp } from './invoiceCatchUp.js';
import { applyLateFeeToInvoice } from './rentBilling.js';
import { buildCommunicationMessage } from './rentCommunications.js';
import { createMemoryStore } from './store.js';

test('runInvoiceCatchUp dry-run reports missing months without creating', async () => {
  const store = createMemoryStore();
  const person = await store.upsertPerson({ displayName: 'Sam', email: 'sam@example.com' });
  const lease = await store.createLease({
    unitId: 'unit-124-w-cherokee-b',
    personId: person.id,
    startDate: '2025-12-01',
    endDate: '2026-11-30',
    rentCents: 155000,
  });
  await store.createInvoice({
    leaseId: lease.id,
    periodStart: '2025-12-01',
    periodEnd: '2025-12-31',
    amountCents: 155000,
    status: 'paid',
    paidCents: 155000,
  });
  await store.createInvoice({
    leaseId: lease.id,
    periodStart: '2026-01-01',
    periodEnd: '2026-01-31',
    amountCents: 155000,
    status: 'paid',
    paidCents: 155000,
  });
  await store.createInvoice({
    leaseId: lease.id,
    periodStart: '2026-02-01',
    periodEnd: '2026-02-28',
    amountCents: 155000,
    status: 'paid',
    paidCents: 155000,
  });
  await store.createInvoice({
    leaseId: lease.id,
    periodStart: '2026-03-01',
    periodEnd: '2026-03-31',
    amountCents: 155000,
    status: 'paid',
    paidCents: 155000,
  });

  const result = await runInvoiceCatchUp(store, {
    leaseId: lease.id,
    dryRun: true,
    now: new Date('2026-11-03T17:00:00.000Z'),
    env: {},
  });
  assert.equal(result.dryRun, true);
  assert.equal(result.created, 0);
  assert.equal(result.leases[0].wouldCreateCount, 8);
  assert.equal((await store.listInvoices()).length, 4);
});

test('runInvoiceCatchUp creates catch-up invoices that skip late fees', async () => {
  const store = createMemoryStore();
  const person = await store.upsertPerson({ displayName: 'Sam', email: 'sam@example.com' });
  const lease = await store.createLease({
    unitId: 'unit-124-w-cherokee-b',
    personId: person.id,
    startDate: '2026-08-01',
    endDate: '2027-07-31',
    rentCents: 155000,
  });

  const result = await runInvoiceCatchUp(store, {
    leaseId: lease.id,
    dryRun: false,
    now: new Date('2026-10-15T17:00:00.000Z'),
    env: {},
  });
  assert.equal(result.created, 3);
  assert.equal(result.emailed, 0);
  assert.equal(result.leases[0].email.reason, 'notify_disabled');
  const invoices = await store.listInvoices();
  assert.equal(invoices.length, 3);
  assert.ok(invoices.every((row) => row.billingSource === 'catchup'));
  assert.equal(result.leases[0].balanceDueCents, 155000 * 3);

  const late = await applyLateFeeToInvoice(store, invoices[0], lease);
  assert.equal(late.applied, false);
});

test('runInvoiceCatchUp notify dry-run reports wouldSend without requiring consent', async () => {
  const store = createMemoryStore();
  const person = await store.upsertPerson({ displayName: 'Sam', email: 'sam@example.com' });
  assert.equal(person.autoCommunicationsEnabled, false);
  const lease = await store.createLease({
    unitId: 'unit-124-w-cherokee-b',
    personId: person.id,
    startDate: '2026-08-01',
    endDate: '2027-07-31',
    rentCents: 155000,
  });

  const result = await runInvoiceCatchUp(store, {
    leaseId: lease.id,
    dryRun: true,
    notify: true,
    now: new Date('2026-10-15T17:00:00.000Z'),
    env: {},
  });
  assert.equal(result.notify, true);
  assert.equal(result.leases[0].email.wouldSend, true);
});

test('buildCommunicationMessage catch-up copy apologizes and waives late fee', () => {
  const content = buildCommunicationMessage({
    messageType: 'invoice_catchup_notice',
    person: { displayName: 'Sam' },
    period: { periodStart: '2026-04-01' },
    amountCents: 310000,
    payUrl: 'https://westcherokee.example/portal/invoices',
    catchupMonths: ['2026-04-01', '2026-05-01'],
  });
  assert.match(content.subject, /catch-up/i);
  assert.match(content.plainText, /apologize/i);
  assert.match(content.plainText, /April 2026/);
  assert.match(content.plainText, /May 2026/);
  assert.match(content.plainText, /no late fee/i);
  assert.match(content.plainText, /\$3,100\.00/);
});
