import { computeUnitHealth, monthLabel, nyDateParts } from './unitHealth.js';

const OPEN_REQUEST_STATUSES = new Set(['open', 'in_progress']);
const CLOSED_REQUEST_STATUSES = new Set(['done', 'cancelled']);
const MS_PER_DAY = 86_400_000;
const RECENT_PAYMENT_LIMIT = 10;
const CLOSED_REQUEST_WINDOW_DAYS = 90;

function nyTodayIso(now = new Date()) {
  const { year, month, day } = nyDateParts(now);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDateOnly(iso) {
  const [year, month, day] = String(iso).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function daysBetween(startIso, endIso) {
  const start = parseDateOnly(startIso);
  const end = parseDateOnly(endIso);
  return Math.max(0, Math.round((end - start) / MS_PER_DAY));
}

export function computeBalanceDue(lease, invoices) {
  if (!lease || lease.status !== 'active') return 0;
  return (invoices || [])
    .filter((invoice) => invoice.leaseId === lease.id && invoice.status !== 'paid')
    .reduce((sum, invoice) => sum + Number(invoice.amountCents), 0);
}

export function openInvoicesForLease(lease, invoices) {
  if (!lease || lease.status !== 'active') return [];
  return (invoices || [])
    .filter((invoice) => invoice.leaseId === lease.id && invoice.status !== 'paid')
    .sort((a, b) => String(a.periodStart).localeCompare(String(b.periodStart)));
}

export function computeLeaseProgress(lease, now = new Date()) {
  if (!lease || lease.status !== 'active') return null;

  const todayIso = nyTodayIso(now);
  const totalDays = daysBetween(lease.startDate, lease.endDate);
  const elapsedDays = Math.min(totalDays, daysBetween(lease.startDate, todayIso));
  const remainingDays = Math.max(0, totalDays - elapsedDays);
  const progressPercent = totalDays > 0 ? Math.min(100, Math.round((elapsedDays / totalDays) * 100)) : 0;

  return {
    startDate: lease.startDate,
    endDate: lease.endDate,
    totalDays,
    elapsedDays,
    remainingDays,
    progressPercent,
  };
}

export function recentPaymentsForLease(payments, invoices, leaseId, limit = RECENT_PAYMENT_LIMIT) {
  const invoiceById = new Map((invoices || []).filter((invoice) => invoice.leaseId === leaseId).map((invoice) => [invoice.id, invoice]));
  return (payments || [])
    .filter((payment) => invoiceById.has(payment.invoiceId))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit)
    .map((payment) => ({
      payment,
      invoice: invoiceById.get(payment.invoiceId) || null,
    }));
}

export function partitionServiceRequests(requests, unitId, now = new Date(), closedWindowDays = CLOSED_REQUEST_WINDOW_DAYS) {
  const cutoff = new Date(now.getTime() - closedWindowDays * MS_PER_DAY);
  const forUnit = (requests || []).filter((request) => request.unitId === unitId);
  const open = forUnit
    .filter((request) => OPEN_REQUEST_STATUSES.has(request.status))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const closedRecent = forUnit
    .filter(
      (request) =>
        CLOSED_REQUEST_STATUSES.has(request.status) && new Date(request.createdAt).getTime() >= cutoff.getTime(),
    )
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return { open, closedRecent };
}

export function buildUnitDetail({
  unit,
  property,
  lease,
  tenant,
  invoices,
  payments,
  serviceRequests,
  unitDefaults,
  now = new Date(),
}) {
  const health = computeUnitHealth({ lease, invoices, now });
  const balanceDueCents = computeBalanceDue(lease, invoices);
  const openInvoices = openInvoicesForLease(lease, invoices).map((invoice) => ({
    ...invoice,
    periodLabel: monthLabel(invoice.periodStart),
  }));
  const leaseProgress = computeLeaseProgress(lease, now);
  const recentPayments = lease
    ? recentPaymentsForLease(payments, invoices, lease.id).map((row) => ({
        ...row,
        periodLabel: row.invoice ? monthLabel(row.invoice.periodStart) : null,
      }))
    : [];
  const { open: openServiceRequests, closedRecent: closedServiceRequests } = partitionServiceRequests(
    serviceRequests,
    unit.id,
    now,
  );

  return {
    unit,
    property,
    lease,
    tenant,
    unitDefaults: unitDefaults || null,
    health,
    balanceDueCents,
    openInvoices,
    leaseProgress,
    recentPayments,
    openServiceRequests,
    closedServiceRequests,
    asOf: now.toISOString(),
  };
}
