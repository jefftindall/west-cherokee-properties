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

/** `heading` is the Maps URL `…h` value. `tilt` is `…t` (90 is level). */
export function streetViewEmbedUrl(
  address: string,
  camera?: { lat?: number; lng?: number; heading?: number; tilt?: number; panoId?: string },
): string {
  const heading = camera?.heading ?? 0;
  const pitch = 90 - (camera?.tilt ?? 90);
  const cbp = `12,${heading},0,0,${pitch}`;
  if (camera?.panoId) {
    return `https://www.google.com/maps?layer=c&panoid=${encodeURIComponent(camera.panoId)}&cbp=${cbp}&output=svembed`;
  }
  if (camera?.lat != null && camera?.lng != null) {
    return `https://www.google.com/maps?layer=c&cbll=${camera.lat},${camera.lng}&cbp=${cbp}&output=svembed`;
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
