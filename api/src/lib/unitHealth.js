import { WCP_LEASE_DEFAULTS, monthlyChargeCents } from './leaseTerms.js';

export const LATE_FEE_CENTS = 5000;
export const GRACE_DAYS = Number(WCP_LEASE_DEFAULTS.lateGraceDays) || 3;
export const NY_TIMEZONE = 'America/New_York';

export function nyDateParts(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: NY_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

export function currentMonthPeriod(date = new Date()) {
  const { year, month } = nyDateParts(date);
  const mm = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  return {
    periodStart: `${year}-${mm}-01`,
    periodEnd: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function monthPeriodForOffset(offset = 0, date = new Date()) {
  const { year, month } = nyDateParts(date);
  let targetYear = year;
  let targetMonth = month + offset;
  while (targetMonth > 12) {
    targetMonth -= 12;
    targetYear += 1;
  }
  while (targetMonth < 1) {
    targetMonth += 12;
    targetYear -= 1;
  }
  const mm = String(targetMonth).padStart(2, '0');
  const lastDay = new Date(targetYear, targetMonth, 0).getDate();
  return {
    periodStart: `${targetYear}-${mm}-01`,
    periodEnd: `${targetYear}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function monthLabel(periodStart) {
  const [year, month] = String(periodStart).split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: NY_TIMEZONE }).format(
    new Date(Date.UTC(year, month - 1, 15, 12, 0, 0)),
  );
}

export function invoicesForPeriod(invoices, leaseId, periodStart, periodEnd) {
  return (invoices || []).filter(
    (invoice) =>
      invoice.leaseId === leaseId &&
      invoice.periodStart === periodStart &&
      invoice.periodEnd === periodEnd,
  );
}

export function activeLeasesForPeriod(leases, periodStart, periodEnd) {
  return (leases || []).filter(
    (lease) =>
      lease.status === 'active' && lease.startDate <= periodEnd && lease.endDate >= periodStart,
  );
}

export function computeRentRollMonth({ leases, invoices, period }) {
  const active = activeLeasesForPeriod(leases, period.periodStart, period.periodEnd);
  const expectedCents = active.reduce((sum, lease) => sum + expectedMonthlyChargeCents(lease), 0);
  const periodInvoices = (invoices || []).filter(
    (invoice) =>
      invoice.periodStart === period.periodStart &&
      invoice.periodEnd === period.periodEnd &&
      active.some((lease) => lease.id === invoice.leaseId),
  );
  const collectedCents = periodInvoices
    .filter((invoice) => invoice.status === 'paid')
    .reduce((sum, invoice) => sum + Number(invoice.amountCents), 0);
  const paidCount = periodInvoices.filter((invoice) => invoice.status === 'paid').length;
  const progressPercent =
    expectedCents > 0 ? Math.min(100, Math.round((collectedCents / expectedCents) * 100)) : 0;

  return {
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    label: monthLabel(period.periodStart),
    expectedCents,
    collectedCents,
    progressPercent,
    unitCount: active.length,
    paidCount,
    openCount: Math.max(0, active.length - paidCount),
  };
}

export function buildRentRoll({ leases, invoices, now = new Date() }) {
  const current = monthPeriodForOffset(0, now);
  const next = monthPeriodForOffset(1, now);
  return {
    currentMonth: computeRentRollMonth({ leases, invoices, period: current, now }),
    nextMonth: computeRentRollMonth({ leases, invoices, period: next, now }),
  };
}

export function invoicesForCurrentMonth(invoices, leaseId, date = new Date()) {
  const { periodStart, periodEnd } = currentMonthPeriod(date);
  return invoicesForPeriod(invoices, leaseId, periodStart, periodEnd);
}

export function expectedMonthlyChargeCents(lease) {
  return monthlyChargeCents(lease.rentCents, lease.terms?.petCount);
}

export function invoiceHasLateFee(invoice, baseCents) {
  if (!invoice || invoice.status === 'paid') return false;
  return Number(invoice.amountCents) > Number(baseCents);
}

export function computeUnitHealth({ lease, invoices, now = new Date() }) {
  if (!lease || lease.status !== 'active') {
    return 'vacant';
  }

  const baseCents = expectedMonthlyChargeCents(lease);
  const monthInvoices = invoicesForCurrentMonth(invoices, lease.id, now);
  const { day } = nyDateParts(now);
  const graceEndDay = 1 + GRACE_DAYS;

  const allPaid =
    monthInvoices.length > 0 ? monthInvoices.every((invoice) => invoice.status === 'paid') : day <= 1;
  if (allPaid) return 'green';

  const openInvoices = monthInvoices.filter((invoice) => invoice.status !== 'paid');
  const hasLateFee =
    openInvoices.length > 0
      ? openInvoices.some((invoice) => invoiceHasLateFee(invoice, baseCents))
      : day > graceEndDay;

  if (day > graceEndDay && hasLateFee) return 'red';
  return 'yellow';
}

export function buildDashboard({ properties, units, leases, people, invoices, now = new Date() }) {
  const leaseByUnit = new Map();
  for (const lease of leases) {
    if (lease.status === 'active') leaseByUnit.set(lease.unitId, lease);
  }
  const peopleById = new Map((people || []).map((person) => [person.id, person]));

  return {
    asOf: now.toISOString(),
    properties: (properties || []).map((property) => ({
      id: property.id,
      slug: property.slug,
      title: property.title,
      city: property.city,
      state: property.state,
      address: property.address,
      units: (units || [])
        .filter((unit) => unit.propertyId === property.id)
        .map((unit) => {
          const lease = leaseByUnit.get(unit.id) || null;
          const health = computeUnitHealth({ lease, invoices, now });
          const tenant = lease ? peopleById.get(lease.personId) || null : null;
          const currentInvoices = lease ? invoicesForCurrentMonth(invoices, lease.id, now) : [];
          return {
            id: unit.id,
            label: unit.label,
            bedrooms: unit.bedrooms,
            bathrooms: unit.bathrooms,
            available: Boolean(unit.available),
            health,
            lease: lease
              ? {
                  id: lease.id,
                  startDate: lease.startDate,
                  endDate: lease.endDate,
                  rentCents: lease.rentCents,
                }
              : null,
            tenant: tenant
              ? { displayName: tenant.displayName, email: tenant.email }
              : null,
            currentInvoices,
          };
        }),
    })),
  };
}
