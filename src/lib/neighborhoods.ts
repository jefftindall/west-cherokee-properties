export type NeighborhoodSlug = 'historic-downtown' | 'north-cartersville';

export function neighborhoodPath(slug: NeighborhoodSlug | string): string {
  return `/neighborhoods/${slug}`;
}

export function groupPlacesByCategory<T extends { category: string }>(places: T[]): { category: string; items: T[] }[] {
  const order: string[] = [];
  const grouped = new Map<string, T[]>();
  for (const place of places) {
    const existing = grouped.get(place.category);
    if (!existing) {
      order.push(place.category);
      grouped.set(place.category, [place]);
    } else {
      existing.push(place);
    }
  }
  return order.map((category) => ({ category, items: grouped.get(category) ?? [] }));
}
