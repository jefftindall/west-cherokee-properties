export const REQUEST_STATUSES = ['open', 'in_progress', 'done', 'cancelled'];

export function normalizeServiceRequest(input) {
  const title = String(input.title || '').trim();
  const details = String(input.details || '').trim();
  const personId = String(input.personId || '').trim();
  if (!title || !details || !personId) {
    const err = new Error('title, details, and personId are required');
    err.name = 'ValidationError';
    throw err;
  }
  return {
    id: input.id,
    personId,
    unitId: input.unitId || null,
    title: title.slice(0, 200),
    details: details.slice(0, 4000),
    status: input.status || 'open',
    createdAt: input.createdAt || new Date().toISOString(),
  };
}

export function requestOwnedByPerson(request, personId) {
  return request && request.personId === personId;
}
