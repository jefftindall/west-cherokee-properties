// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://westcherokee.com',
  output: 'static',
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
    sitemap({
      filter: (page) =>
        !page.includes('/style-guide') &&
        !page.includes('/office') &&
        !page.includes('/portal') &&
        !page.includes('/login'),
    }),
  ],
  image: {
    layout: 'constrained',
  },
});
