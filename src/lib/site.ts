export const site = {
  name: 'West Cherokee Properties',
  tagline: 'Homes you can count on',
  description:
    'West Cherokee Properties manages rental homes in Cartersville, Georgia — fair applications, clear leases, and a resident portal for rent and service requests.',
  url: 'https://westcherokeeproperties.com',
  logoPath: '/logo.png',
  jobTitle: 'Property management',
  email: process.env.SITE_CONTACT_EMAIL || 'hello@example.com',
  phone: process.env.SITE_CONTACT_PHONE || '',
};

export const nav = [
  { href: '/properties', label: 'Properties' },
  { href: '/about', label: 'About' },
  { href: '/apply', label: 'Apply' },
  { href: '/contact', label: 'Contact' },
];
