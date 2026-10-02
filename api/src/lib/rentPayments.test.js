import assert from 'node:assert/strict';
import test from 'node:test';
import { runRentLateFeeScheduler } from './rentBilling.js';
import {
  applyRentCheckoutEvent,
  computeLeaseBalance,
  createRentCheckout,
  isRentCheckoutEvent,
  lateFeeNotice,
  MIN_PARTIAL_PAYMENT_CENTS,
  validatePaymentAmount,
} from './rentPayments.js';
import { createMemoryStore } from './store.js';
import { LATE_FEE_CENTS } from './unitHealth.js';

async function seedLease(store, { rentCents = 145000 } = {}) {
  const person = await store.upsertPerson({ displayName: 'Jordan', email: 'jordan@example.com' });
  const lease = await store.createLease({
    unitId: 'unit-124-w-cherokee-a',
    personId: person.id,
    startDate: '2026-01-01',
    endDate: '2027-01-01',
    rentCents,
  });
  return { person, lease };
}

function fakeStripe() {
  const sessions = [];
  return {
    sessions,
    customers: { create: async () => ({ id: 'cus_test_1' }) },
    checkout: {
      sessions: {
        create: async (params) => {
          const session = { id: `cs_test_${sessions.length + 1}`, url: 'https://checkout.stripe.test/s', ...params };
          sessions.push(session);
          return session;
        },
      },
    },
    paymentIntents: {
      retrieve: async () => ({ latest_charge: { receipt_url: 'https://pay.stripe.test/receipt' } }),
    },
  };
}

function checkoutEvent(type, sessionId, extra = {}) {
  return {
    id: `evt_${type}_${sessionId}`,
    type,
    data: { object: { id: sessionId, metadata: { wcp_checkout: 'rent' }, payment_intent: 'pi_test_1', ...extra } },
  };
}

test('balance minimum is $100, or the full balance when it is smaller', () => {
  const lease = { id: 'lease-1', status: 'active' };
  const big = computeLeaseBalance(lease, [
    { id: 'a', leaseId: 'lease-1', periodStart: '2026-08-01', amountCents: 145000, paidCents: 0, status: 'open' },
  ]);
  assert.equal(big.payableCents, 145000);
  assert.equal(big.minimumCents, MIN_PARTIAL_PAYMENT_CENTS);

  const small = computeLeaseBalance(lease, [
    { id: 'a', leaseId: 'lease-1', periodStart: '2026-08-01', amountCents: 145000, paidCents: 140000, status: 'open' },
  ]);
  assert.equal(small.payableCents, 5000);
  assert.equal(small.minimumCents, 5000);
});

test('processing bank payments reduce what can be paid now', () => {
  const lease = { id: 'lease-1', status: 'active' };
  const balance = computeLeaseBalance(
    lease,
    [{ id: 'a', leaseId: 'lease-1', periodStart: '2026-08-01', amountCents: 145000, status: 'open' }],
    [
      { id: 'cs_1', status: 'processing', amountCents: 50000 },
      { id: 'cs_2', status: 'open', amountCents: 90000 },
    ],
  );
  assert.equal(balance.balanceCents, 145000);
  assert.equal(balance.processingCents, 50000);
  assert.equal(balance.payableCents, 95000);
});

test('validatePaymentAmount enforces the minimum and the balance', () => {
  const balance = { payableCents: 145000, minimumCents: 10000 };
  assert.throws(() => validatePaymentAmount(9999, balance), /minimum payment is \$100\.00/);
  assert.throws(() => validatePaymentAmount(145001, balance), /up to your balance of \$1450\.00/);
  assert.throws(() => validatePaymentAmount(12.5, balance), /dollars and cents/);
  validatePaymentAmount(10000, balance);
  validatePaymentAmount(145000, balance);

  const small = { payableCents: 5000, minimumCents: 5000 };
  assert.throws(() => validatePaymentAmount(4000, small), /pay the full balance/);
  validatePaymentAmount(5000, small);
});

test('createRentCheckout sends one fixed-amount line item and records the checkout', async () => {
  const store = createMemoryStore();
  const { person, lease } = await seedLease(store);
  await store.createInvoice({ leaseId: lease.id, periodStart: '2026-08-01', periodEnd: '2026-08-31', amountCents: 145000 });
  const stripe = fakeStripe();

  const result = await createRentCheckout({
    stripe,
    store,
    person,
    lease,
    amountCents: 25000,
    siteUrl: 'https://site.test',
    now: new Date('2026-08-02T17:00:00.000Z'),
  });

  assert.equal(result.url, 'https://checkout.stripe.test/s');
  const params = stripe.sessions[0];
  assert.equal(params.mode, 'payment');
  assert.equal(params.line_items.length, 1);
  assert.equal(params.line_items[0].quantity, 1);
  assert.equal(params.line_items[0].price_data.unit_amount, 25000);
  assert.equal(params.line_items[0].adjustable_quantity, undefined);
  assert.equal(params.payment_method_types, undefined);
  assert.equal(params.metadata.wcp_lease_id, lease.id);
  assert.match(params.success_url, /\/portal\/invoices\?payment=success$/);

  const [row] = await store.listPaymentCheckouts(lease.id);
  assert.equal(row.status, 'open');
  assert.equal(row.amountCents, 25000);
});

test('createRentCheckout rejects amounts under the minimum before calling Stripe', async () => {
  const store = createMemoryStore();
  const { person, lease } = await seedLease(store);
  await store.createInvoice({ leaseId: lease.id, periodStart: '2026-08-01', periodEnd: '2026-08-31', amountCents: 145000 });
  const stripe = fakeStripe();
  await assert.rejects(
    createRentCheckout({ stripe, store, person, lease, amountCents: 5000, siteUrl: 'https://site.test' }),
    /minimum payment/,
  );
  assert.equal(stripe.sessions.length, 0);
});

test('a card payment is applied oldest charge first and a webhook retry does not double-apply', async () => {
  const store = createMemoryStore();
  const { person, lease } = await seedLease(store);
  const july = await store.createInvoice({ leaseId: lease.id, periodStart: '2026-07-01', periodEnd: '2026-07-31', amountCents: 50000 });
  const august = await store.createInvoice({ leaseId: lease.id, periodStart: '2026-08-01', periodEnd: '2026-08-31', amountCents: 145000 });
  const stripe = fakeStripe();
  const { checkoutId } = await createRentCheckout({ stripe, store, person, lease, amountCents: 80000, siteUrl: 'https://site.test' });

  const event = checkoutEvent('checkout.session.completed', checkoutId, { payment_status: 'paid' });
  assert.equal(isRentCheckoutEvent(event), true);
  const first = await applyRentCheckoutEvent(event, store, stripe);
  assert.equal(first.kind, 'paid');
  const again = await applyRentCheckoutEvent(event, store, stripe);
  assert.equal(again.kind, 'duplicate');

  const julyAfter = await store.getInvoice(july.id);
  const augustAfter = await store.getInvoice(august.id);
  assert.equal(julyAfter.status, 'paid');
  assert.equal(julyAfter.paidCents, 50000);
  assert.equal(augustAfter.status, 'open');
  assert.equal(augustAfter.paidCents, 30000);

  const payments = await store.listPayments();
  assert.equal(payments.length, 2);
  assert.equal(payments.reduce((sum, row) => sum + row.amountCents, 0), 80000);
  assert.ok(payments.every((row) => row.receiptUrl === 'https://pay.stripe.test/receipt'));

  const [checkout] = await store.listPaymentCheckouts(lease.id);
  assert.equal(checkout.status, 'succeeded');
});

test('a bank payment is processing until it clears, then applies', async () => {
  const store = createMemoryStore();
  const { person, lease } = await seedLease(store);
  const invoice = await store.createInvoice({ leaseId: lease.id, periodStart: '2026-08-01', periodEnd: '2026-08-31', amountCents: 145000 });
  const stripe = fakeStripe();
  const { checkoutId } = await createRentCheckout({ stripe, store, person, lease, amountCents: 145000, siteUrl: 'https://site.test' });

  const pending = await applyRentCheckoutEvent(
    checkoutEvent('checkout.session.completed', checkoutId, { payment_status: 'unpaid' }),
    store,
    stripe,
  );
  assert.equal(pending.kind, 'processing');
  assert.equal((await store.getInvoice(invoice.id)).status, 'open');
  const balance = computeLeaseBalance(lease, await store.listInvoices(), await store.listPaymentCheckouts(lease.id));
  assert.equal(balance.payableCents, 0);

  const cleared = await applyRentCheckoutEvent(
    checkoutEvent('checkout.session.async_payment_succeeded', checkoutId, { payment_status: 'paid' }),
    store,
    stripe,
  );
  assert.equal(cleared.kind, 'paid');
  assert.equal((await store.getInvoice(invoice.id)).status, 'paid');
});

test('a failed bank payment frees the balance and an expired session changes nothing', async () => {
  const store = createMemoryStore();
  const { person, lease } = await seedLease(store);
  await store.createInvoice({ leaseId: lease.id, periodStart: '2026-08-01', periodEnd: '2026-08-31', amountCents: 145000 });
  const stripe = fakeStripe();
  const bank = await createRentCheckout({ stripe, store, person, lease, amountCents: 145000, siteUrl: 'https://site.test' });
  await applyRentCheckoutEvent(checkoutEvent('checkout.session.completed', bank.checkoutId, { payment_status: 'unpaid' }), store, stripe);
  const failed = await applyRentCheckoutEvent(checkoutEvent('checkout.session.async_payment_failed', bank.checkoutId), store, stripe);
  assert.equal(failed.kind, 'failed');

  const abandoned = await createRentCheckout({ stripe, store, person, lease, amountCents: 20000, siteUrl: 'https://site.test' });
  const expired = await applyRentCheckoutEvent(checkoutEvent('checkout.session.expired', abandoned.checkoutId), store, stripe);
  assert.equal(expired.applied, true);

  const balance = computeLeaseBalance(lease, await store.listInvoices(), await store.listPaymentCheckouts(lease.id));
  assert.equal(balance.payableCents, 145000);
  assert.equal((await store.listPayments()).length, 0);
});

test('lateFeeNotice: partial payments keep the fee pending; a processing full payment defers it', () => {
  const lease = { id: 'lease-1', status: 'active', rentCents: 145000, terms: {} };
  const invoice = { id: 'a', leaseId: 'lease-1', periodStart: '2026-08-01', periodEnd: '2026-08-31', amountCents: 145000, paidCents: 50000, status: 'open' };

  const inGrace = lateFeeNotice(lease, [invoice], [], new Date('2026-08-03T17:00:00.000Z'));
  assert.equal(inGrace.status, 'in_grace');
  assert.equal(inGrace.graceEndsOn, '2026-08-04');
  assert.equal(inGrace.lateFeeCents, LATE_FEE_CENTS);

  const afterGrace = lateFeeNotice(lease, [invoice], [], new Date('2026-08-05T17:00:00.000Z'));
  assert.equal(afterGrace.status, 'late_fee_pending');

  const processing = lateFeeNotice(
    lease,
    [invoice],
    [{ id: 'cs_1', status: 'processing', amountCents: 95000 }],
    new Date('2026-08-05T17:00:00.000Z'),
  );
  assert.equal(processing.status, 'full_payment_processing');

  const upcoming = lateFeeNotice(
    lease,
    [{ ...invoice, id: 'b', periodStart: '2026-09-01', periodEnd: '2026-09-30', paidCents: 0 }],
    [],
    new Date('2026-08-25T17:00:00.000Z'),
  );
  assert.equal(upcoming.status, 'upcoming');
  assert.equal(upcoming.dueDate, '2026-09-01');
});

test('late fee scheduler charges after a partial payment but defers for a processing full payment', async () => {
  const store = createMemoryStore();
  const { lease } = await seedLease(store);
  const invoice = await store.createInvoice({ leaseId: lease.id, periodStart: '2026-08-01', periodEnd: '2026-08-31', amountCents: 145000 });
  await store.updateInvoice(invoice.id, { paidCents: 50000 });

  await store.createPaymentCheckout({ id: 'cs_full', leaseId: lease.id, personId: lease.personId, amountCents: 95000, status: 'processing' });
  const deferred = await runRentLateFeeScheduler(store, {}, new Date('2026-08-05T17:00:00.000Z'));
  assert.equal(deferred.applied, 0);
  assert.equal(deferred.deferred, 1);

  await store.transitionPaymentCheckout('cs_full', ['processing'], { status: 'failed' });
  const charged = await runRentLateFeeScheduler(store, {}, new Date('2026-08-05T17:00:00.000Z'));
  assert.equal(charged.applied, 1);
  assert.equal((await store.getInvoice(invoice.id)).amountCents, 145000 + LATE_FEE_CENTS);
});
