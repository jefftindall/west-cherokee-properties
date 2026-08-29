export type FloorPlan = {
  label: string;
  bedrooms: number;
  bathrooms: number;
  available?: boolean;
};

export function formatBedBath(unit: FloorPlan): string {
  const beds = `${unit.bedrooms} bed`;
  const baths = `${unit.bathrooms} bath`;
  return `${beds}, ${baths}`;
}

export function formatFloorPlan(unit: FloorPlan): string {
  const name = /^[A-Z]$/i.test(unit.label) ? `Unit ${unit.label}` : unit.label;
  return `${name} — ${formatBedBath(unit)}`;
}
