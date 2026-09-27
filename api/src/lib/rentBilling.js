import { openInvoicesForLease } from './unitDetail.js';
import {
  activeLeasesForPeriod,
  expectedMonthlyChargeCents,
  GRACE_DAYS,
  invoiceHasLateFee,
  invoicesForCurrentMonth,
  LATE_FEE_CENTS,
  monthPeriodForOffset,
  nyDateParts,
} from './unitHealth.js';
import { ensureInvoiceForLeasePeriod, findInvoiceForPeriod } from './payments.js';
import {
  createStripeInvoiceForRow,
  rentPaymentsEnabled,
  stripeWebhookClient,
} from './stripeWebhook.js';
import { ensureStripeCustomer } from './stripeCustomers.js';

export const INVOICE_LEAD_DAYS = 10;

export function nyTodayIso(now = new Date()) {
  const { year, month, day } = nyDateParts(now);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function addDaysToIsoDate(isoDate, days) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** When today is exactly 10 NY days before the 1st, return that billing month. */
export function billingPeriodForSchedulingDay(now = new Date()) {
  const today = nyTodayIso(now);
  const dueDate = addDaysToIsoDate(today, INVOICE_LEAD_DAYS);
  if (!dueDate.endsWith('-01')) return null;
  const [year, month] = dueDate.split('-').map(Number);
  const mm = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  return {
    periodStart: `${year}-${mm}-01`,
    periodEnd: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function priorOpenInvoicesForLease(lease, invoices, currentPeriodStart) {
  return openInvoicesForLease(lease, invoices).filter(
    (invoice) => invoice.periodStart < currentPeriodStart,
  );
}

export function stripeReady(env = process.env) {
  return (
    rentPaymentsEnabled(env) &&
    String(env.STRIPE_SECRET_KEY || '').startsWith('sk_') &&
    !String(env.STRIPE_SECRET_KEY || '').includes('not_configured')
  );
}

export async function runRentInvoiceScheduler(store, env = process.env, now = new Date()) {
  const period = billingPeriodForSchedulingDay(now);
  if (!period) {
    return { skipped: true, reason: 'not_scheduling_day', created: 0, stripeCreated: 0 };
  }

  const [leases, invoices] = await Promise.all([store.listLeases(), store.listInvoices()]);
  const active = activeLeasesForPeriod(leases, period.periodStart, period.periodEnd);
  const stripe = stripeReady(env) ? stripeWebhookClient(env.STRIPE_SECRET_KEY) : null;
  const siteUrl = env.SITE_URL || 'https://westcherokee.com';

  let created = 0;
  let stripeCreated = 0;
  const errors = [];

  for (const lease of active) {
    try {
      const existing = findInvoiceForPeriod(invoices, lease.id, period.periodStart, period.periodEnd);
      let invoice = await ensureInvoiceForLeasePeriod(store, lease, period.periodStart, period.periodEnd);
      if (!existing && invoice.status !== 'paid') created += 1;

      if (stripe && !invoice.stripeInvoiceId && invoice.status !== 'paid') {
        const person = await store.getPerson(lease.personId);
        if (!person?.email) continue;
        const customerId = await ensureStripeCustomer({ stripe, store, person });
        const priorOpen = priorOpenInvoicesForLease(lease, invoices, period.periodStart);
        const stripeInv = await createStripeInvoiceForRow({
          stripe,
          customerId,
          appInvoice: invoice,
          priorOpenInvoices: priorOpen,
          siteUrl,
        });
        invoice = await store.updateInvoice(invoice.id, stripeInv);
        stripeCreated += 1;
      }
    } catch (err) {
      errors.push({ leaseId: lease.id, error: err instanceof Error ? err.message : 'unknown' });
    }
  }

  return {
    skipped: false,
    period,
    created,
    stripeCreated,
    leaseCount: active.length,
    errors,
  };
}

export async function applyLateFeeToInvoice(store, stripe, invoice, lease) {
  const baseCents = expectedMonthlyChargeCents(lease);
  if (invoiceHasLateFee(invoice, baseCents) || invoice.status === 'paid') {
    return { applied: false, invoice };
  }
  const nextAmount = Number(invoice.amountCents) + LATE_FEE_CENTS;
  const updated = await store.updateInvoice(invoice.id, { amountCents: nextAmount });

  if (stripe && updated.stripeInvoiceId) {
    const person = await store.getPerson(lease.personId);
    const customerId = String(person?.stripeCustomerId || '').trim();
    if (customerId) {
      await stripe.invoiceItems.create({
        customer: customerId,
        invoice: updated.stripeInvoiceId,
        amount: LATE_FEE_CENTS,
        currency: 'usd',
        description: 'Late fee',
      });
    }
  }

  return { applied: true, invoice: updated };
}

export async function runRentLateFeeScheduler(store, env = process.env, now = new Date()) {
  const { day } = nyDateParts(now);
  const graceEndDay = 1 + GRACE_DAYS;
  if (day <= graceEndDay) {
    return { skipped: true, reason: 'within_grace', applied: 0 };
  }

  const [leases, invoices] = await Promise.all([store.listLeases(), store.listInvoices()]);
  const active = leases.filter((lease) => lease.status === 'active');
  const stripe = stripeReady(env) ? stripeWebhookClient(env.STRIPE_SECRET_KEY) : null;

  let applied = 0;
  const errors = [];

  for (const lease of active) {
    try {
      const monthInvoices = invoicesForCurrentMonth(invoices, lease.id, now).filter(
        (invoice) => invoice.status !== 'paid',
      );
      for (const invoice of monthInvoices) {
        const result = await applyLateFeeToInvoice(store, stripe, invoice, lease);
        if (result.applied) applied += 1;
      }
    } catch (err) {
      errors.push({ leaseId: lease.id, error: err instanceof Error ? err.message : 'unknown' });
    }
  }

  return { skipped: false, applied, errors };
}

export function currentMonthPeriodFromNow(now = new Date()) {
  return monthPeriodForOffset(0, now);
}
