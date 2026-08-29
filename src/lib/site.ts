export const site = {
  name: 'West Cherokee Properties',
  tagline: 'A few good homes in Cartersville',
  description:
    'We look after a handful of rental homes in Cartersville, Georgia — two downtown addresses near the square, and a quieter pair of units on Falcon Circle.',
  url: 'https://westcherokee.com',
  logoPath: '/logo.png',
  jobTitle: 'Property management',
  email: process.env.SITE_CONTACT_EMAIL || 'info@westcherokee.com',
  phone: process.env.SITE_CONTACT_PHONE || '678-885-7368',
  phoneLabel: '678-885-RENT (7368)',
  phoneTel: '+16788857368',
};

export const nav = [
  { href: '/properties', label: 'Properties' },
  { href: '/neighborhoods', label: 'Neighborhoods' },
  { href: '/about', label: 'About' },
  { href: '/apply', label: 'Apply' },
  { href: '/contact', label: 'Contact' },
];
