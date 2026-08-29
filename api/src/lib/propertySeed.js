/** Operational seed for properties and units. Keep in sync with src/content/properties. */

export const SEEDED_PROPERTIES = [
  {
    id: 'prop-124-w-cherokee',
    slug: '124-w-cherokee',
    title: '124 W Cherokee Ave',
    city: 'Cartersville',
    state: 'GA',
    address: '124 W Cherokee Ave, Cartersville, GA 30120',
  },
  {
    id: 'prop-11-noble',
    slug: '11-noble',
    title: '11 Noble St',
    city: 'Cartersville',
    state: 'GA',
    address: '11 Noble St, Cartersville, GA 30120',
  },
  {
    id: 'prop-10-falcon-circle',
    slug: '10-falcon-circle',
    title: '10 Falcon Circle',
    city: 'Cartersville',
    state: 'GA',
    address: '10 Falcon Circle, Cartersville, GA 30121',
  },
];

export const SEEDED_UNITS = [
  { id: 'unit-124-w-cherokee-a', propertyId: 'prop-124-w-cherokee', label: 'A', bedrooms: 2, bathrooms: 1 },
  { id: 'unit-124-w-cherokee-b', propertyId: 'prop-124-w-cherokee', label: 'B', bedrooms: 3, bathrooms: 2 },
  { id: 'unit-11-noble', propertyId: 'prop-11-noble', label: 'Single Unit', bedrooms: 2, bathrooms: 1 },
  { id: 'unit-10-falcon-a', propertyId: 'prop-10-falcon-circle', label: 'A', bedrooms: 2, bathrooms: 1 },
  { id: 'unit-10-falcon-b', propertyId: 'prop-10-falcon-circle', label: 'B', bedrooms: 2, bathrooms: 1 },
];
