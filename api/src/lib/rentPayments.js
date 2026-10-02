import { applyPaymentToInvoice, invoiceRemainingCents } from './invoices.js';
import { ensureStripeCustomer } from './stripeCustomers.js';
import { openInvoicesForLease } from './unitDetail.js';
import {
  currentMonthPeriod,
  expectedMonthlyChargeCents,
  GRACE_DAYS,
  invoiceHasLateFee,
  invoicesForCurrentMonth,
  LATE_FEE_CENTS,
  monthPeriodForOffset,
  nyDateParts,
} from './unitHealth.js';

export const MIN_PARTIAL_PAYMENT_CENTS = 10_000;
// Stripe requires Checkout expiry of at least 30 minutes; keep sessions short so the amount
// cannot drift far from the SQL balance before payment.
export const CHECKOUT_EXPIRY_SECONDS = 31 * 60;
const CHECKOUT_INTEGRATION_ID = 'wcp-rent-portal-kqvhmzta';
const CHECKOUT_METADATA_KIND = 'rent';

function dollars(cents) {
  return `$${(Number(cents) / 100).toFixed(2)}`;
}

function validationError(message) {
  const err = new Error(message);
  err.name = 'ValidationError';
  return err;
}

/** ACH payments submitted but not settled yet. Abandoned 'open' sessions do not hold the balance. */
export function processingCheckoutCents(checkouts = []) {
  return checkouts
    .filter((row) => row.status === 'processing')
    .reduce((sum, row) => sum + Number(row.amountCents), 0);
}

export function computeLeaseBalance(lease, invoices, checkouts = []) {
  const openInvoices = openInvoicesForLease(lease, invoices).map((invoice) => ({
    ...invoice,
    remainingCents: invoiceRemainingCents(invoice),
  }));
  const balanceCents = openInvoices.reduce((sum, row) => sum + row.remainingCents, 0);
  const processingCents = processingCheckoutCents(checkouts);
  const payableCents = Math.max(0, balanceCents - processingCents);
  const minimumCents = payableCents === 0 ? 0 : Math.min(MIN_PARTIAL_PAYMENT_CENTS, payableCents);
  return { balanceCents, processingCents, payableCents, minimumCents, openInvoices };
}

export function validatePaymentAmount(amountCents, balance) {
  if (!Number.isInteger(amountCents) || amountCents < 1) {
    throw validationError('Enter a payment amount in dollars and cents.');
  }
  if (balance.payableCents <= 0) {
    throw validationError('There is no balance to pay right now.');
  }
  if (amountCents > balance.payableCents) {
    throw validationError(`You can pay up to your balance of ${dollars(balance.payableCents)}.`);
  }
  if (amountCents < balance.minimumCents) {
    throw validationError(
      balance.payableCents < MIN_PARTIAL_PAYMENT_CENTS
        ? `Your balance is ${dollars(balance.payableCents)}, under the ${dollars(MIN_PARTIAL_PAYMENT_CENTS)} minimum, so please pay the full balance.`
        : `The minimum payment is ${dollars(MIN_PARTIAL_PAYMENT_CENTS)}.`,
    );
  }
}

function graceEndIso(periodStart) {
  return `${periodStart.slice(0, 8)}${String(1 + GRACE_DAYS).padStart(2, '0')}`;
}

/**
 * Late-fee status for the portal. Only a full payment of the month's charge by the end of the grace
 * period avoids the fee; partial payments reduce the balance but do not stop it.
 */
export function lateFeeNotice(lease, invoices, checkouts = [], now = new Date()) {
  if (!lease || lease.status !== 'active') return null;
  const { day } = nyDateParts(now);
  const graceEndDay = 1 + GRACE_DAYS;
  const base = { lateFeeCents: LATE_FEE_CENTS, graceDays: GRACE_DAYS };
  const current = currentMonthPeriod(now);
  const unpaidCurrent = invoicesForCurrentMonth(invoices, lease.id, now).filter((row) => row.status !== 'paid');

  if (unpaidCurrent.length) {
    const baseCents = expectedMonthlyChargeCents(lease);
    const remaining = unpaidCurrent.reduce((sum, row) => sum + invoiceRemainingCents(row), 0);
    const fullPaymentProcessing = processingCheckoutCents(checkouts) >= remaining;
    let status = 'in_grace';
    if (unpaidCurrent.some((row) => invoiceHasLateFee(row, baseCents))) status = 'late_fee_applied';
    else if (fullPaymentProcessing) status = 'full_payment_processing';
    else if (day > graceEndDay) status = 'late_fee_pending';
    return { ...base, status, dueDate: current.periodStart, graceEndsOn: graceEndIso(current.periodStart) };
  }

  const next = monthPeriodForOffset(1, now);
  const upcoming = (invoices || []).some(
    (row) => row.leaseId === lease.id && row.periodStart === next.periodStart && row.status !== 'paid',
  );
  if (upcoming) {
    return { ...base, status: 'upcoming', dueDate: next.periodStart, graceEndsOn: graceEndIso(next.periodStart) };
  }
  return { ...base, status: 'current', dueDate: null, graceEndsOn: null };
}

export async function createRentCheckout({ stripe, store, person, lease, amountCents, siteUrl, now = new Date() }) {
  const [invoices, checkouts] = await Promise.all([store.listInvoices(), store.listPaymentCheckouts(lease.id)]);
  const balance = computeLeaseBalance(lease, invoices, checkouts);
  validatePaymentAmount(amountCents, balance);

  const customerId = await ensureStripeCustomer({ stripe, store, person });
  const metadata = { wcp_checkout: CHECKOUT_METADATA_KIND, wcp_lease_id: lease.id, wcp_person_id: person.id };
  const label = amountCents === balance.payableCents ? 'Rent payment' : 'Partial rent payment';
  // One fixed line item with no adjustable quantity: the amount is chosen and validated on our site only.
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: customerId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: amountCents,
          product_data: { name: `${label} — West Cherokee Properties` },
        },
      },
    ],
    metadata,
    payment_intent_data: {
      metadata,
      description: label,
      ...(person.email ? { receipt_email: person.email } : {}),
    },
    success_url: `${siteUrl}/portal/invoices?payment=success`,
    cancel_url: `${siteUrl}/portal/invoices?payment=cancelled`,
    expires_at: Math.floor(now.getTime() / 1000) + CHECKOUT_EXPIRY_SECONDS,
    integration_identifier: CHECKOUT_INTEGRATION_ID,
  });

  await store.createPaymentCheckout({
    id: session.id,
    leaseId: lease.id,
    personId: person.id,
    amountCents,
    status: 'open',
  });
  return { url: session.url, checkoutId: session.id };
}

/**
 * Apply a settled amount to the lease's open charges, oldest first. Each per-invoice payment carries
 * a `${keyPrefix}:${invoiceId}` key so a retried webhook skips what it already applied.
 */
export async function allocatePaymentToLease(store, lease, amountCents, { keyPrefix, ...paymentFields }) {
  const [invoices, payments] = await Promise.all([store.listInvoices(), store.listPayments()]);
  const alreadyApplied = keyPrefix
    ? payments.filter((row) => String(row.stripeEventId || '').startsWith(`${keyPrefix}:`))
    : [];
  let left = amountCents - alreadyApplied.reduce((sum, row) => sum + Number(row.amountCents), 0);
  const allocations = alreadyApplied.map((row) => ({ invoiceId: row.invoiceId, amountCents: Number(row.amountCents) }));

  for (const invoice of openInvoicesForLease(lease, invoices)) {
    if (left <= 0) break;
    const remaining = invoiceRemainingCents(invoice);
    if (remaining <= 0) continue;
    const take = Math.min(remaining, left);
    await applyPaymentToInvoice(store, invoice, {
      ...paymentFields,
      amountCents: take,
      stripeEventId: keyPrefix ? `${keyPrefix}:${invoice.id}` : paymentFields.stripeEventId,
    });
    allocations.push({ invoiceId: invoice.id, amountCents: take });
    left -= take;
  }
  return { allocations, unappliedCents: Math.max(0, left) };
}

function paymentIntentId(session) {
  const pi = session?.payment_intent;
  return typeof pi === 'string' ? pi : pi?.id || '';
}

async function receiptUrlFor(stripe, piId) {
  if (!stripe || !piId) return '';
  try {
    const intent = await stripe.paymentIntents.retrieve(piId, { expand: ['latest_charge'] });
    return intent?.latest_charge?.receipt_url || '';
  } catch {
    return '';
  }
}

async function settleCheckout(store, stripe, session) {
  const checkout = await store.getPaymentCheckout(session.id);
  if (!checkout) return { applied: false, kind: 'unmatched' };
  if (checkout.status === 'succeeded') return { applied: false, kind: 'duplicate' };
  const lease = await store.getLease(checkout.leaseId);
  const piId = paymentIntentId(session);
  const { allocations, unappliedCents } = await allocatePaymentToLease(store, lease, checkout.amountCents, {
    keyPrefix: `checkout:${checkout.id}`,
    source: 'stripe',
    stripePaymentIntentId: piId,
    receiptUrl: await receiptUrlFor(stripe, piId),
  });
  await store.transitionPaymentCheckout(checkout.id, ['open', 'processing', 'failed', 'expired'], {
    status: 'succeeded',
    stripePaymentIntentId: piId,
    unappliedCents,
  });
  return { applied: true, kind: 'paid', invoiceCount: allocations.length, unappliedCents };
}

export function isRentCheckoutEvent(event) {
  return (
    String(event?.type || '').startsWith('checkout.session.') &&
    event?.data?.object?.metadata?.wcp_checkout === CHECKOUT_METADATA_KIND
  );
}

export async function applyRentCheckoutEvent(event, store, stripe = null) {
  const session = event.data.object;
  switch (event.type) {
    case 'checkout.session.completed':
      if (session.payment_status === 'paid') return settleCheckout(store, stripe, session);
      if (session.payment_status === 'unpaid') {
        const row = await store.transitionPaymentCheckout(session.id, ['open'], {
          status: 'processing',
          stripePaymentIntentId: paymentIntentId(session),
        });
        return { applied: Boolean(row), kind: 'processing' };
      }
      return { applied: false, kind: 'ignored' };
    case 'checkout.session.async_payment_succeeded':
      return settleCheckout(store, stripe, session);
    case 'checkout.session.async_payment_failed': {
      const row = await store.transitionPaymentCheckout(session.id, ['open', 'processing'], { status: 'failed' });
      return { applied: Boolean(row), kind: 'failed' };
    }
    case 'checkout.session.expired': {
      const row = await store.transitionPaymentCheckout(session.id, ['open'], { status: 'expired' });
      return { applied: Boolean(row), kind: 'expired' };
    }
    default:
      return { applied: false, kind: 'ignored' };
  }
}
