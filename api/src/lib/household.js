import { ValidationError } from './errors.js';
import { resolvePersonContact } from './people.js';

export const OCCUPANT_RELATIONSHIPS = [
  'biological child',
  'legally adopted child',
  'spouse or partner',
  'other family member',
  'other authorized occupant',
];

export function normalizeCoTenant(input = {}) {
  const displayName = String(input.displayName || input.name || '').trim();
  if (!displayName) throw new ValidationError('Co-tenant name is required.');
  const contact = resolvePersonContact({ email: input.email, phone: input.phone });
  return { displayName, ...contact };
}

export function normalizeAdditionalOccupant(input = {}, primaryName = '') {
  const name = String(input.name || '').trim();
  const relationship = String(input.relationship || '').trim();
  if (!name) throw new ValidationError('Occupant name is required.');
  if (!OCCUPANT_RELATIONSHIPS.includes(relationship)) {
    throw new ValidationError('Occupant relationship is required.');
  }
  return { name, relationship, primaryName: String(primaryName || '').trim() };
}

export function formatAuthorizedOccupantLine(occupant) {
  const primary = occupant.primaryName || 'leaseholder';
  return `${occupant.name} (${occupant.relationship} of ${primary})`;
}

export function buildHouseholdLeaseTerms({ primaryName, coTenants = [], additionalOccupants = [] } = {}) {
  const primary = String(primaryName || '').trim();
  if (!primary) throw new ValidationError('Primary renter name is required.');
  const adultNames = [primary, ...coTenants.map((tenant) => tenant.displayName).filter(Boolean)];
  const authorizedLines = [
    ...adultNames,
    ...additionalOccupants.map((occupant) => formatAuthorizedOccupantLine({ ...occupant, primaryName: primary })),
  ];
  return {
    tenantNames: adultNames,
    authorizedOccupants: authorizedLines.join('\n'),
    coTenants: coTenants.map(({ displayName, email, emailKey, phone, personId }) => ({
      ...(personId ? { personId } : {}),
      displayName,
      email,
      emailKey,
      phone,
    })),
    additionalOccupants: additionalOccupants.map((occupant) => ({
      name: occupant.name,
      relationship: occupant.relationship,
    })),
  };
}
