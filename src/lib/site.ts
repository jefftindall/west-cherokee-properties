export const site = {
  name: 'West Cherokee Properties',
  tagline: 'Homes you can count on',
  description:
    'West Cherokee Properties manages rental homes in Cartersville, Georgia — fair applications, clear leases, and a resident portal for rent and service requests.',
  url: 'https://westcherokee.com',
  logoPath: '/logo.png',
  jobTitle: 'Property management',
  email: process.env.SITE_CONTACT_EMAIL || 'info@westcherokee.com',
  phone: process.env.SITE_CONTACT_PHONE || '678-885-7368',
  phoneVanity: '678-885-RENT',
  phoneTel: '+16788857368',
};

export const nav = [
  { href: '/properties', label: 'Properties' },
  { href: '/about', label: 'About' },
  { href: '/apply', label: 'Apply' },
  { href: '/contact', label: 'Contact' },
];
