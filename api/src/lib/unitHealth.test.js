import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDashboard,
  buildRentRoll,
  computeUnitHealth,
  currentMonthPeriod,
  invoicesForCurrentMonth,
  nyDateParts,
} from './unitHealth.js';
import { SEEDED_PROPERTIES, SEEDED_UNITS } from './propertySeed.js';

const AUG_2_2026_NY = new Date('2026-08-02T15:00:00-04:00');
const AUG_5_2026_NY = new Date('2026-08-05T15:00:00-04:00');
const AUG_1_2026_NY = new Date('2026-08-01T12:00:00-04:00');

function lease(overrides = {}) {
  return {
    id: 'lease-1',
    unitId: 'unit-124-w-cherokee-a',
    personId: 'person-1',
    startDate: '2026-01-01',
    endDate: '2027-01-01',
    rentCents: 145000,
    status: 'active',
    terms: { petCount: 0 },
    ...overrides,
  };
}

test('nyDateParts uses America/New_York calendar day', () => {
  const parts = nyDateParts(new Date('2026-08-01T04:30:00Z'));
  assert.equal(parts.year, 2026);
  assert.equal(parts.month, 8);
  assert.equal(parts.day, 1);
});

test('currentMonthPeriod covers the full calendar month in New York', () => {
  assert.deepEqual(currentMonthPeriod(AUG_2_2026_NY), {
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
  });
});

test('vacant when there is no active lease', () => {
  assert.equal(computeUnitHealth({ lease: null, invoices: [] }), 'vacant');
  assert.equal(computeUnitHealth({ lease: lease({ status: 'ended' }), invoices: [] }), 'vacant');
});

test('green when current-month invoices are paid', () => {
  const active = lease({ startDate: '2026-08-01' });
  const invoices = [
    {
      leaseId: active.id,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      amountCents: 145000,
      status: 'paid',
    },
  ];
  assert.equal(computeUnitHealth({ lease: active, invoices, now: AUG_2_2026_NY }), 'green');
});

test('yellow when unpaid within grace (2nd through 4th)', () => {
  const active = lease({ startDate: '2026-08-01' });
  const invoices = [
    {
      leaseId: active.id,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      amountCents: 145000,
      status: 'open',
    },
  ];
  assert.equal(computeUnitHealth({ lease: active, invoices, now: AUG_2_2026_NY }), 'yellow');
});

test('yellow within grace when prior months are paid and only current is open', () => {
  const active = lease({ startDate: '2026-07-01' });
  const invoices = [
    {
      leaseId: active.id,
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
      amountCents: 145000,
      status: 'paid',
    },
    {
      leaseId: active.id,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      amountCents: 145000,
      status: 'open',
    },
  ];
  assert.equal(computeUnitHealth({ lease: active, invoices, now: AUG_2_2026_NY }), 'yellow');
});

test('red within grace when a prior month is still open', () => {
  const active = lease({ startDate: '2026-07-01' });
  const invoices = [
    {
      leaseId: active.id,
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
      amountCents: 150000,
      status: 'open',
    },
    {
      leaseId: active.id,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      amountCents: 145000,
      status: 'open',
    },
  ];
  assert.equal(computeUnitHealth({ lease: active, invoices, now: AUG_2_2026_NY }), 'red');
});

test('red within grace when prior months were never invoiced (already overdue)', () => {
  const active = lease({ startDate: '2025-12-01', endDate: '2026-11-30', rentCents: 155000 });
  const invoices = [
    {
      leaseId: active.id,
      periodStart: '2025-12-01',
      periodEnd: '2025-12-31',
      amountCents: 155000,
      status: 'paid',
    },
    {
      leaseId: active.id,
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      amountCents: 155000,
      status: 'paid',
    },
    {
      leaseId: active.id,
      periodStart: '2026-02-01',
      periodEnd: '2026-02-28',
      amountCents: 155000,
      status: 'paid',
    },
    {
      leaseId: active.id,
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
      amountCents: 155000,
      status: 'paid',
    },
  ];
  const nov3 = new Date('2026-11-03T15:00:00-05:00');
  assert.equal(computeUnitHealth({ lease: active, invoices, now: nov3 }), 'red');
});

test('red when current month is paid but a prior month is still open', () => {
  const active = lease({ startDate: '2026-07-01' });
  const invoices = [
    {
      leaseId: active.id,
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
      amountCents: 150000,
      status: 'open',
    },
    {
      leaseId: active.id,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      amountCents: 145000,
      status: 'paid',
    },
  ];
  assert.equal(computeUnitHealth({ lease: active, invoices, now: AUG_2_2026_NY }), 'red');
});

test('red only after grace when a late fee is on the open invoice', () => {
  const active = lease({ startDate: '2026-08-01' });
  const invoices = [
    {
      leaseId: active.id,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      amountCents: 150000,
      status: 'open',
    },
  ];
  assert.equal(computeUnitHealth({ lease: active, invoices, now: AUG_5_2026_NY }), 'red');
});

test('after grace stays yellow until late fee is applied', () => {
  const active = lease({ startDate: '2026-08-01' });
  const invoices = [
    {
      leaseId: active.id,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      amountCents: 145000,
      status: 'open',
    },
  ];
  assert.equal(computeUnitHealth({ lease: active, invoices, now: AUG_5_2026_NY }), 'yellow');
});

test('day 1 with no invoice yet stays green', () => {
  assert.equal(
    computeUnitHealth({ lease: lease({ startDate: '2026-08-01' }), invoices: [], now: AUG_1_2026_NY }),
    'green',
  );
});

test('invoicesForCurrentMonth filters by lease and period', () => {
  const active = lease();
  const invoices = [
    {
      leaseId: active.id,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      status: 'open',
    },
    {
      leaseId: active.id,
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
      status: 'paid',
    },
    {
      leaseId: 'lease-other',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      status: 'open',
    },
  ];
  assert.equal(invoicesForCurrentMonth(invoices, active.id, AUG_2_2026_NY).length, 1);
});

test('buildDashboard groups five units across three properties', () => {
  const dashboard = buildDashboard({
    properties: SEEDED_PROPERTIES,
    units: SEEDED_UNITS,
    leases: [lease({ startDate: '2026-08-01' })],
    people: [{ id: 'person-1', displayName: 'Jordan', email: 'jordan@example.com' }],
    invoices: [],
    now: AUG_1_2026_NY,
  });
  assert.equal(dashboard.properties.length, 3);
  assert.equal(dashboard.properties.reduce((sum, property) => sum + property.units.length, 0), 5);
  const occupied = dashboard.properties.flatMap((property) => property.units).find((unit) => unit.health !== 'vacant');
  assert.equal(occupied?.health, 'green');
  assert.equal(dashboard.properties.flatMap((property) => property.units).filter((unit) => unit.health === 'vacant').length, 4);
});

test('buildRentRoll sums expected and collected rent for current and next month', () => {
  const active = lease();
  const invoices = [
    {
      leaseId: active.id,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      amountCents: 145000,
      status: 'paid',
    },
  ];
  const roll = buildRentRoll({
    leases: [active],
    invoices,
    now: AUG_2_2026_NY,
  });
  assert.equal(roll.currentMonth.expectedCents, 145000);
  assert.equal(roll.currentMonth.collectedCents, 145000);
  assert.equal(roll.currentMonth.progressPercent, 100);
  assert.equal(roll.currentMonth.label, 'August 2026');
  assert.equal(roll.nextMonth.expectedCents, 145000);
  assert.equal(roll.nextMonth.collectedCents, 0);
  assert.equal(roll.nextMonth.progressPercent, 0);
});
