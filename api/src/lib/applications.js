export const APPLICATION_STATUSES = ['submitted', 'in_review', 'approved', 'declined', 'withdrawn'];

export function normalizeApplication(input) {
  const fullName = String(input.fullName || '').trim();
  const email = String(input.email || '').trim();
  const propertySlug = String(input.propertySlug || '').trim();
  if (!fullName) throw Object.assign(new Error('fullName is required'), { name: 'ValidationError' });
  if (!email || !email.includes('@')) throw Object.assign(new Error('email is required'), { name: 'ValidationError' });
  if (!propertySlug) throw Object.assign(new Error('propertySlug is required'), { name: 'ValidationError' });
  const householdSize = Number(input.householdSize || 1);
  if (!Number.isInteger(householdSize) || householdSize < 1 || householdSize > 12) {
    throw Object.assign(new Error('householdSize must be 1–12'), { name: 'ValidationError' });
  }
  return {
    id: input.id,
    propertySlug,
    fullName,
    email,
    phone: String(input.phone || '').trim(),
    desiredMoveIn: String(input.desiredMoveIn || '').trim(),
    householdSize,
    notes: String(input.notes || '').trim().slice(0, 4000),
    status: input.status || 'submitted',
    personId: input.personId || null,
    createdAt: input.createdAt || new Date().toISOString(),
  };
}

export async function approveApplication(store, applicationId, { unitId, startDate, endDate, rentCents }) {
  const application = await store.getApplication(applicationId);
  if (!application) {
    const err = new Error('Application not found.');
    err.name = 'NotFoundError';
    throw err;
  }
  if (application.status === 'approved') return { application, already: true };
  const person = await store.upsertPerson({
    displayName: application.fullName,
    email: application.email,
    phone: application.phone,
  });
  const lease = await store.createLease({
    unitId,
    personId: person.id,
    startDate,
    endDate,
    rentCents,
    status: 'active',
    tenantNames: application.fullName,
    terms: {
      tenantNames: application.fullName,
      authorizedOccupants: application.fullName,
      maxOccupants: application.householdSize,
      securityDepositCents: rentCents,
      petCount: 0,
      approvedPets: 'None',
      effectiveDate: startDate,
    },
  });
  const updated = await store.updateApplicationStatus(applicationId, 'approved', { personId: person.id });
  return { application: updated, person, lease };
}
