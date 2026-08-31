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
          if (req.url) {
            const q = req.url.indexOf('?');
            const pathname = q === -1 ? req.url : req.url.slice(0, q);
            const search = q === -1 ? '' : req.url.slice(q);
            if (/^\/office\/leases\/lease-[^/?#]+/.test(pathname)) {
              req.url = `/office/lease-document${search}`;
            }
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
    server: {
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:7071',
          changeOrigin: true,
        },
      },
    },
  },
  integrations: [
    sitemap({
      filter: (page) =>
        !page.includes('/office') &&
        !page.includes('/portal') &&
        !page.includes('/login'),
    }),
  ],
  image: {
    layout: 'constrained',
  },
});
