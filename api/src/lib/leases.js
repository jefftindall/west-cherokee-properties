import { defaultTermsForUnit, normalizeLeaseTerms } from './leaseTerms.js';

export function normalizeLease(input) {
  const unitId = String(input.unitId || '').trim();
  const personId = String(input.personId || '').trim();
  const startDate = String(input.startDate || '').trim();
  const endDate = String(input.endDate || '').trim();
  const rentCents = Number(input.rentCents);
  if (!unitId || !personId) {
    const err = new Error('unitId and personId are required');
    err.name = 'ValidationError';
    throw err;
  }
  if (!startDate || !endDate) {
    const err = new Error('startDate and endDate are required');
    err.name = 'ValidationError';
    throw err;
  }
  if (!Number.isInteger(rentCents) || rentCents < 1) {
    const err = new Error('rentCents must be a positive integer');
    err.name = 'ValidationError';
    throw err;
  }
  const terms = input.terms
    ? normalizeLeaseTerms(input.terms)
    : defaultTermsForUnit(unitId, { rentCents, startDate, tenantNames: input.tenantNames });
  return {
    id: input.id,
    unitId,
    personId,
    startDate,
    endDate,
    rentCents,
    status: input.status || 'active',
    terms,
  };
}

export function assertUnitVacant(leases, unitId, ignoreLeaseId) {
  const taken = (leases || []).find(
    (lease) => lease.unitId === unitId && lease.status === 'active' && lease.id !== ignoreLeaseId,
  );
  if (taken) {
    const err = new Error('That unit already has an active lease.');
    err.name = 'ConflictError';
    throw err;
  }
}
