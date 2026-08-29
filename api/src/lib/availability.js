import { SEEDED_PROPERTIES, SEEDED_UNITS } from './propertySeed.js';

export function propertyAcceptsApplications(slug) {
  const property = SEEDED_PROPERTIES.find((row) => row.slug === slug);
  if (!property) return false;
  return SEEDED_UNITS.some((unit) => unit.propertyId === property.id && unit.available === true);
}
