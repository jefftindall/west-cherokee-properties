import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyStripeLedgerEvent,
  extractPaidInvoice,
  stripeEventTelemetry,
  stripeWebhookClient,
  verifyStripeWebhookEvent,
} from './stripeWebhook.js';
import { createMemoryStore } from './store.js';

const secret = 'whsec_test_secret';
const stripe = stripeWebhookClient('sk_test_not_used');

function signedPayload(event) {
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
  return { payload, signature };
}

test('verifyStripeWebhookEvent accepts a valid signature', () => {
  const event = {
    id: 'evt_test_webhook',
    object: 'event',
    type: 'invoice.paid',
    data: { object: { id: 'in_should_not_leak' } },
  };
  const { payload, signature } = signedPayload(event);
  const result = verifyStripeWebhookEvent({
    rawBody: payload,
    signature,
    webhookSecret: secret,
    stripe,
  });
  assert.equal(result.ok, true);
  assert.equal(result.event.type, 'invoice.paid');
});

test('verifyStripeWebhookEvent rejects a bad signature', () => {
  const result = verifyStripeWebhookEvent({
    rawBody: '{}',
    signature: 't=1,v1=deadbeef',
    webhookSecret: secret,
    stripe,
  });
  assert.deepEqual(result, { ok: false, status: 400, errorKind: 'signature' });
});

test('stripeEventTelemetry is event id and type only', () => {
  const telemetry = stripeEventTelemetry({
    id: 'evt_abc',
    type: 'charge.refunded',
    data: { object: { customer_email: 'renter@example.com' } },
  });
  assert.deepEqual(telemetry, { eventId: 'evt_abc', eventType: 'charge.refunded' });
  assert.equal(JSON.stringify(telemetry).includes('renter@'), false);
});

test('applyStripeLedgerEvent marks a matching invoice paid', async () => {
  const store = createMemoryStore();
  const person = await store.upsertPerson({ displayName: 'Jordan', email: 'jordan@example.com' });
  const lease = await store.createLease({
    unitId: 'unit-124-w-cherokee-a',
    personId: person.id,
    startDate: '2026-09-01',
    endDate: '2027-08-31',
    rentCents: 100000,
  });
  const invoice = await store.createInvoice({
    leaseId: lease.id,
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    amountCents: 100000,
  });
  await store.updateInvoice(invoice.id, { stripeInvoiceId: 'in_123' });
  const paid = extractPaidInvoice({
    type: 'invoice.paid',
    data: { object: { id: 'in_123', amount_paid: 100000, payment_intent: 'pi_1' } },
  });
  assert.equal(paid.stripeInvoiceId, 'in_123');
  const result = await applyStripeLedgerEvent(
    {
      id: 'evt_paid',
      type: 'invoice.paid',
      data: { object: { id: 'in_123', amount_paid: 100000, receipt_url: 'https://stripe.test/r' } },
    },
    store,
  );
  assert.equal(result.applied, true);
  const updated = await store.getInvoice(invoice.id);
  assert.equal(updated.status, 'paid');
});
