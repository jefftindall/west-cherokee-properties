// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

/** Dev-only: mirror SWA rewrite for /office/leases/lease-* → lease-document shell. */
function leaseDocumentDevRewrite() {
  return {
    name: 'lease-document-dev-rewrite',
    /** @param {import('vite').ViteDevServer} server */
    configureServer(server) {
      server.middlewares.use(
        /** @param {import('http').IncomingMessage} req @param {import('http').ServerResponse} _res @param {() => void} next */
        (req, _res, next) => {
          if (req.url && /^\/office\/leases\/lease-[^/?#]+/.test(req.url)) {
            req.url = '/office/lease-document';
          }
          next();
        },
      );
    },
  };
}

export default defineConfig({
  site: 'https://westcherokee.com',
  output: 'static',
  vite: {
    plugins: [tailwindcss(), leaseDocumentDevRewrite()],
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
