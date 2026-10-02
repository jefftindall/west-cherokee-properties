import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryStore } from './store.js';
import {
  buildCommunicationMessage,
  previewCommunications,
  selectCommunicationForLease,
} from './rentCommunications.js';
import { parseInvoiceIdsFromMetadata, rentCommunicationsEnabled } from './stripeWebhook.js';

test('selectCommunicationForLease picks due_reminder on the 1st', () => {
  const lease = { id: 'lease-1', status: 'active', rentCents: 100000, terms: {} };
  const invoices = [
    { id: 'inv-1', leaseId: 'lease-1', periodStart: '2026-08-01', periodEnd: '2026-08-31', amountCents: 100000, status: 'open' },
  ];
  const selected = selectCommunicationForLease({
    lease,
    invoices,
    commState: null,
    now: new Date('2026-08-01T17:00:00.000Z'),
  });
  assert.equal(selected?.messageType, 'due_reminder');
});

test('selectCommunicationForLease picks grace_warning during grace', () => {
  const lease = { id: 'lease-1', status: 'active', rentCents: 100000, terms: {} };
  const invoices = [
    { id: 'inv-1', leaseId: 'lease-1', periodStart: '2026-08-01', periodEnd: '2026-08-31', amountCents: 100000, status: 'open' },
  ];
  const selected = selectCommunicationForLease({
    lease,
    invoices,
    commState: null,
    now: new Date('2026-08-03T17:00:00.000Z'),
  });
  assert.equal(selected?.messageType, 'grace_warning');
});

test('selectCommunicationForLease picks balance_overdue after grace with late fee', () => {
  const lease = { id: 'lease-1', status: 'active', rentCents: 100000, terms: {} };
  const invoices = [
    { id: 'inv-1', leaseId: 'lease-1', periodStart: '2026-08-01', periodEnd: '2026-08-31', amountCents: 105000, status: 'open' },
  ];
  const selected = selectCommunicationForLease({
    lease,
    invoices,
    commState: null,
    now: new Date('2026-08-06T17:00:00.000Z'),
  });
  assert.equal(selected?.messageType, 'balance_overdue');
});

test('previewCommunications lists eligible messages without sending', async () => {
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
  const preview = await previewCommunications(store, new Date('2026-08-01T17:00:00.000Z'));
  assert.equal(preview.messages.length, 1);
  assert.equal(preview.messages[0].messageType, 'due_reminder');
});

test('buildCommunicationMessage includes tenant name, portal link, and late-fee policy', () => {
  const content = buildCommunicationMessage({
    messageType: 'due_reminder',
    person: { displayName: 'Jordan' },
    period: { periodStart: '2026-08-01' },
    amountCents: 145000,
    payUrl: 'https://westcherokee.example/portal/invoices',
  });
  assert.match(content.plainText, /Jordan/);
  assert.match(content.subject, /Rent due today/);
  assert.match(content.plainText, /https:\/\/westcherokee\.example\/portal\/invoices/);
  assert.match(content.plainText, /end of the 4th, a \$50\.00 late fee/);
  assert.match(content.plainText, /partial payments \(minimum \$100\.00\)/);
});

test('reminders use the remaining balance after a partial payment', () => {
  const selected = selectCommunicationForLease({
    lease: { id: 'lease-1', status: 'active', rentCents: 100000, terms: {} },
    invoices: [
      { id: 'inv-1', leaseId: 'lease-1', periodStart: '2026-08-01', periodEnd: '2026-08-31', amountCents: 100000, paidCents: 40000, status: 'open' },
    ],
    commState: null,
    now: new Date('2026-08-03T17:00:00.000Z'),
  });
  assert.equal(selected.messageType, 'grace_warning');
  assert.equal(selected.amountCents, 60000);
});

test('parseInvoiceIdsFromMetadata reads bundled invoice ids', () => {
  assert.deepEqual(parseInvoiceIdsFromMetadata({ wcp_invoice_ids: 'inv-1,inv-2' }), ['inv-1', 'inv-2']);
});

test('rentCommunicationsEnabled reads env flag', () => {
  assert.equal(rentCommunicationsEnabled({ RENT_COMMUNICATIONS_ENABLED: 'true' }), true);
  assert.equal(rentCommunicationsEnabled({ RENT_COMMUNICATIONS_ENABLED: 'false' }), false);
});
