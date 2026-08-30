export async function propertyAcceptsApplications(store, slug) {
  const properties = await store.listProperties();
  const property = properties.find((row) => row.slug === slug);
  if (!property) return false;
  const units = await store.listUnits(property.id);
  return units.some((unit) => unit.available === true);
}
