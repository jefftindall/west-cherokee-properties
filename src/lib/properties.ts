import type { CollectionEntry } from 'astro:content';

export type PropertyEntry = CollectionEntry<'properties'>;

export function mapsSearchUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function mapsDirectionsUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

export function mapsEmbedUrl(address: string): string {
  return `https://maps.google.com/maps?q=${encodeURIComponent(address)}&z=16&output=embed`;
}

export function streetViewEmbedUrl(address: string, lat?: number, lng?: number): string {
  if (lat != null && lng != null) {
    return `https://www.google.com/maps?layer=c&cbll=${lat},${lng}&cbp=12,0,0,0,0&output=svembed`;
  }
  return `https://maps.google.com/maps?q=${encodeURIComponent(address)}&layer=c&z=17&output=svembed`;
}

export function zillowSearchUrl(address: string): string {
  const slug = address.replace(/,/g, '').replace(/\s+/g, '-');
  return `https://www.zillow.com/homes/${slug}_rb/`;
}

export function unitIsAvailable(unit: { available?: boolean }): boolean {
  return unit.available === true;
}

export function propertyHasVacancy(property: PropertyEntry): boolean {
  return property.data.units.some(unitIsAvailable);
}

export function siteHasVacancy(properties: PropertyEntry[]): boolean {
  return properties.some(propertyHasVacancy);
}
