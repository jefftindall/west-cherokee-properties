import { invoiceLateFeeExempt, invoiceRemainingCents } from './invoices.js';
import { processingCheckoutCents } from './rentPayments.js';
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

export const INVOICE_LEAD_DAYS = 10;
/** If the daily job misses the exact lead day, still create that month's charge within this window. */
export const INVOICE_SCHEDULE_LOOKBACK_DAYS = 3;

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

/** Billing period whose charge posts on this Eastern calendar day (10 days before the 1st). */
export function billingPeriodForIsoDate(isoDate) {
  const dueDate = addDaysToIsoDate(isoDate, INVOICE_LEAD_DAYS);
  if (!dueDate.endsWith('-01')) return null;
  const [year, month] = dueDate.split('-').map(Number);
  const mm = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  return {
    periodStart: `${year}-${mm}-01`,
    periodEnd: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
    schedulingDay: isoDate,
  };
}

/** When today (Eastern time) is exactly 10 days before the 1st, return that billing month. */
export function billingPeriodForSchedulingDay(now = new Date()) {
  return billingPeriodForIsoDate(nyTodayIso(now));
}

/**
 * Billing periods whose scheduling day falls in [today - lookback, today] (Eastern).
 * Used so a missed daily run still posts the charge while tenants still have notice.
 */
export function billingPeriodsForLookback(now = new Date(), lookbackDays = INVOICE_SCHEDULE_LOOKBACK_DAYS) {
  const today = nyTodayIso(now);
  const periods = [];
  const seen = new Set();
  for (let offset = 0; offset <= lookbackDays; offset += 1) {
    const day = addDaysToIsoDate(today, -offset);
    const period = billingPeriodForIsoDate(day);
    if (!period || seen.has(period.periodStart)) continue;
    seen.add(period.periodStart);
    periods.push(period);
  }
  return periods;
}

/** Creates charges for scheduling days in the lookback window. Prior open balances stay on their own invoices. */
export async function runRentInvoiceScheduler(store, _env = process.env, now = new Date()) {
  const periods = billingPeriodsForLookback(now);
  if (!periods.length) {
    return { skipped: true, reason: 'not_scheduling_day', created: 0, periods: [] };
  }

  const [leases, invoices] = await Promise.all([store.listLeases(), store.listInvoices()]);
  let created = 0;
  const errors = [];
  const periodSummaries = [];

  for (const period of periods) {
    const active = activeLeasesForPeriod(leases, period.periodStart, period.periodEnd);
    let periodCreated = 0;
    for (const lease of active) {
      try {
        const existing = findInvoiceForPeriod(invoices, lease.id, period.periodStart, period.periodEnd);
        if (existing) continue;
        const invoice = await ensureInvoiceForLeasePeriod(store, lease, period.periodStart, period.periodEnd, {
          billingSource: 'scheduler',
        });
        invoices.push(invoice);
        created += 1;
        periodCreated += 1;
      } catch (err) {
        errors.push({ leaseId: lease.id, periodStart: period.periodStart, error: err instanceof Error ? err.message : 'unknown' });
      }
    }
    periodSummaries.push({
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      schedulingDay: period.schedulingDay,
      created: periodCreated,
      leaseCount: active.length,
    });
  }

  return {
    skipped: false,
    period: periods[0],
    periods: periodSummaries,
    created,
    leaseCount: periodSummaries.reduce((sum, row) => sum + row.leaseCount, 0),
    errors,
  };
}

export async function applyLateFeeToInvoice(store, invoice, lease) {
  const baseCents = expectedMonthlyChargeCents(lease);
  if (invoiceLateFeeExempt(invoice) || invoiceHasLateFee(invoice, baseCents) || invoice.status === 'paid') {
    return { applied: false, invoice };
  }
  const updated = await store.updateInvoice(invoice.id, {
    amountCents: Number(invoice.amountCents) + LATE_FEE_CENTS,
  });
  return { applied: true, invoice: updated };
}

/**
 * After grace, any current-month charge not paid in full gets the late fee. Partial payments do not
 * prevent it. A submitted bank payment that covers the full remaining amount counts as paid on time;
 * if it later fails, the next run applies the fee.
 */
export async function runRentLateFeeScheduler(store, _env = process.env, now = new Date()) {
  const { day } = nyDateParts(now);
  const graceEndDay = 1 + GRACE_DAYS;
  if (day <= graceEndDay) {
    return { skipped: true, reason: 'within_grace', applied: 0 };
  }

  const [leases, invoices] = await Promise.all([store.listLeases(), store.listInvoices()]);
  const active = leases.filter((lease) => lease.status === 'active');

  let applied = 0;
  let deferred = 0;
  const errors = [];

  for (const lease of active) {
    try {
      const monthInvoices = invoicesForCurrentMonth(invoices, lease.id, now).filter(
        (invoice) => invoice.status !== 'paid',
      );
      if (!monthInvoices.length) continue;
      const remaining = monthInvoices.reduce((sum, invoice) => sum + invoiceRemainingCents(invoice), 0);
      const processing = processingCheckoutCents(await store.listPaymentCheckouts(lease.id));
      if (processing >= remaining) {
        deferred += 1;
        continue;
      }
      for (const invoice of monthInvoices) {
        const result = await applyLateFeeToInvoice(store, invoice, lease);
        if (result.applied) applied += 1;
      }
    } catch (err) {
      errors.push({ leaseId: lease.id, error: err instanceof Error ? err.message : 'unknown' });
    }
  }

  return { skipped: false, applied, deferred, errors };
}

export function currentMonthPeriodFromNow(now = new Date()) {
  return monthPeriodForOffset(0, now);
}
