import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildUnitDetail,
  computeBalanceDue,
  computeLeaseProgress,
  computePaidThroughDate,
  partitionServiceRequests,
  recentPaymentsForLease,
} from './unitDetail.js';

const NOW = new Date('2026-08-15T15:00:00-04:00');

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

function paidInvoice(periodStart, periodEnd, overrides = {}) {
  return {
    id: `inv-${periodStart}`,
    leaseId: 'lease-1',
    periodStart,
    periodEnd,
    amountCents: 145000,
    status: 'paid',
    ...overrides,
  };
}

test('computeBalanceDue sums open invoices for the active lease', () => {
  const active = lease();
  const invoices = [
    { id: 'inv-1', leaseId: active.id, amountCents: 145000, status: 'open' },
    { id: 'inv-2', leaseId: active.id, amountCents: 150000, status: 'open' },
    { id: 'inv-3', leaseId: active.id, amountCents: 145000, status: 'paid' },
    { id: 'inv-4', leaseId: 'lease-other', amountCents: 100000, status: 'open' },
  ];
  assert.equal(computeBalanceDue(active, invoices), 295000);
  assert.equal(computeBalanceDue(null, invoices), 0);
});

test('computePaidThroughDate stops at the first unpaid billing month', () => {
  const active = lease();
  const invoices = [
    paidInvoice('2026-01-01', '2026-01-31'),
    paidInvoice('2026-02-01', '2026-02-28'),
    paidInvoice('2026-03-01', '2026-03-31'),
    paidInvoice('2026-04-01', '2026-04-30'),
    paidInvoice('2026-05-01', '2026-05-31'),
    paidInvoice('2026-06-01', '2026-06-30'),
    paidInvoice('2026-07-01', '2026-07-31'),
    { id: 'inv-aug', leaseId: active.id, periodStart: '2026-08-01', periodEnd: '2026-08-31', amountCents: 145000, status: 'open' },
  ];
  assert.equal(computePaidThroughDate(active, invoices, NOW), '2026-07-31');
});

test('computeLeaseProgress uses green paid-through, yellow unpaid elapsed, and gray remaining', () => {
  const active = lease();
  const invoices = [
    paidInvoice('2026-01-01', '2026-01-31'),
    paidInvoice('2026-02-01', '2026-02-28'),
    paidInvoice('2026-03-01', '2026-03-31'),
    paidInvoice('2026-04-01', '2026-04-30'),
    paidInvoice('2026-05-01', '2026-05-31'),
    paidInvoice('2026-06-01', '2026-06-30'),
    paidInvoice('2026-07-01', '2026-07-31'),
    { id: 'inv-aug', leaseId: active.id, periodStart: '2026-08-01', periodEnd: '2026-08-31', amountCents: 145000, status: 'open' },
  ];
  const progress = computeLeaseProgress(active, invoices, NOW);
  assert.equal(progress.totalDays, 365);
  assert.equal(progress.elapsedDays, 226);
  assert.equal(progress.remainingDays, 139);
  assert.equal(progress.paidThroughDate, '2026-07-31');
  assert.ok(progress.paidPercent > progress.unpaidElapsedPercent);
  assert.ok(progress.unpaidElapsedPercent > 0);
  assert.equal(progress.paymentsCurrent, false);
  assert.equal(progress.paidPercent + progress.unpaidElapsedPercent + progress.remainingPercent, 100);
});

test('computeLeaseProgress hides yellow when payments are current', () => {
  const active = lease();
  const invoices = [
    paidInvoice('2026-01-01', '2026-01-31'),
    paidInvoice('2026-02-01', '2026-02-28'),
    paidInvoice('2026-03-01', '2026-03-31'),
    paidInvoice('2026-04-01', '2026-04-30'),
    paidInvoice('2026-05-01', '2026-05-31'),
    paidInvoice('2026-06-01', '2026-06-30'),
    paidInvoice('2026-07-01', '2026-07-31'),
    paidInvoice('2026-08-01', '2026-08-31'),
  ];
  const progress = computeLeaseProgress(active, invoices, NOW);
  assert.equal(progress.unpaidElapsedPercent, 0);
  assert.equal(progress.paymentsCurrent, true);
  assert.ok(progress.paidPercent >= progress.progressPercent);
  assert.equal(progress.paidPercent + progress.remainingPercent, 100);
});

test('recentPaymentsForLease returns newest payments for the lease', () => {
  const active = lease();
  const invoices = [
    { id: 'inv-1', leaseId: active.id, periodStart: '2026-07-01', periodEnd: '2026-07-31' },
    { id: 'inv-2', leaseId: active.id, periodStart: '2026-08-01', periodEnd: '2026-08-31' },
    { id: 'inv-3', leaseId: 'lease-other', periodStart: '2026-08-01', periodEnd: '2026-08-31' },
  ];
  const payments = [
    { id: 'pay-1', invoiceId: 'inv-1', amountCents: 145000, createdAt: '2026-07-05T12:00:00.000Z' },
    { id: 'pay-2', invoiceId: 'inv-2', amountCents: 145000, createdAt: '2026-08-05T12:00:00.000Z' },
    { id: 'pay-3', invoiceId: 'inv-3', amountCents: 100000, createdAt: '2026-08-06T12:00:00.000Z' },
  ];
  const rows = recentPaymentsForLease(payments, invoices, active.id);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].payment.id, 'pay-2');
  assert.equal(rows[1].payment.id, 'pay-1');
});

test('partitionServiceRequests splits open and recently closed by unit', () => {
  const requests = [
    { id: 'sr-1', unitId: 'unit-a', status: 'open', createdAt: '2026-08-01T12:00:00.000Z', title: 'Leak' },
    { id: 'sr-2', unitId: 'unit-a', status: 'done', createdAt: '2026-07-01T12:00:00.000Z', title: 'HVAC' },
    { id: 'sr-3', unitId: 'unit-a', status: 'done', createdAt: '2026-03-01T12:00:00.000Z', title: 'Old' },
    { id: 'sr-4', unitId: 'unit-b', status: 'open', createdAt: '2026-08-01T12:00:00.000Z', title: 'Other unit' },
  ];
  const { open, closedRecent } = partitionServiceRequests(requests, 'unit-a', NOW);
  assert.deepEqual(
    open.map((row) => row.id),
    ['sr-1'],
  );
  assert.deepEqual(
    closedRecent.map((row) => row.id),
    ['sr-2'],
  );
});

test('buildUnitDetail assembles health, billing, lease progress, and requests', () => {
  const active = lease();
  const detail = buildUnitDetail({
    unit: { id: 'unit-124-w-cherokee-a', propertyId: 'prop-1', label: 'A', bedrooms: 2, bathrooms: 1, available: false },
    property: { id: 'prop-1', title: '124 W Cherokee Ave' },
    lease: active,
    tenant: { displayName: 'Jordan', email: 'jordan@example.com' },
    invoices: [
      {
        id: 'inv-1',
        leaseId: active.id,
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
        amountCents: 145000,
        status: 'open',
      },
    ],
    payments: [],
    serviceRequests: [{ id: 'sr-1', unitId: active.unitId, status: 'open', createdAt: '2026-08-10T12:00:00.000Z', title: 'Dishwasher' }],
    now: NOW,
  });
  assert.equal(detail.health, 'yellow');
  assert.equal(detail.balanceDueCents, 145000);
  assert.ok(detail.leaseProgress.unpaidElapsedPercent > 0);
  assert.equal(detail.openServiceRequests.length, 1);
  assert.equal(detail.recentPayments.length, 0);
});
