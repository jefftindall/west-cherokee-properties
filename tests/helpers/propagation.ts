import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const PROPAGATION_DEADLINE_MS = 4 * 60 * 1000;
export const PROPAGATION_POLL_MS = 5_000;

export function isStaticWebAppHost(): boolean {
  const base = process.env.BASE_URL ?? '';
  return /\.azurestaticapps\.net/i.test(base) || /westcherokee\.com/i.test(base);
}

export function expectsStagingNoIndex(): boolean {
  try {
    const host = new URL(process.env.BASE_URL || 'http://localhost').hostname.toLowerCase();
    return host === 'test.westcherokee.com' || host.endsWith('.azurestaticapps.net');
  } catch {
    return false;
  }
}

export async function waitForOk(page: Page, path: string) {
  const deadline = Date.now() + PROPAGATION_DEADLINE_MS;
  let lastStatus = 0;
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
      lastStatus = response?.status() ?? 0;
      if (lastStatus >= 200 && lastStatus < 400) return response!;
      lastError = `HTTP ${lastStatus}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await page.waitForTimeout(PROPAGATION_POLL_MS);
  }
  throw new Error(`Timed out waiting for ${path} (last: ${lastError || lastStatus})`);
}

export async function waitForRequestOk(
  request: APIRequestContext,
  path: string,
  options?: { maxRedirects?: number },
) {
  const deadline = Date.now() + PROPAGATION_DEADLINE_MS;
  let lastStatus = 0;
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      const response = await request.get(path, options);
      lastStatus = response.status();
      if (lastStatus >= 200 && lastStatus < 400) return response;
      lastError = `HTTP ${lastStatus}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((resolve) => setTimeout(resolve, PROPAGATION_POLL_MS));
  }
  throw new Error(`Timed out waiting for ${path} (last: ${lastError || lastStatus})`);
}

const LOGIN_LOCATION = /\/(\.auth\/login|login)/i;

function pathnameKey(urlOrPath: string, base: string): string {
  try {
    return new URL(urlOrPath, base).pathname.replace(/\/$/, '') || '/';
  } catch {
    return urlOrPath.replace(/\/$/, '') || '/';
  }
}

/**
 * SWA default hosts 301 to the custom domain on the same path before Easy Auth
 * issues 302 /login. Follow that hop only; do not follow into the login page.
 */
export async function expectAnonymousAuthRedirect(
  request: APIRequestContext,
  path: string,
) {
  const deadline = Date.now() + PROPAGATION_DEADLINE_MS;
  let lastDetail = '';
  let target = path;

  while (Date.now() < deadline) {
    const seen = new Set<string>();
    for (let hop = 0; hop < 5; hop += 1) {
      const response = await request.get(target, { maxRedirects: 0 });
      const status = response.status();
      const location = response.headers()['location'] || '';
      lastDetail = `HTTP ${status} location=${location || '(none)'}`;

      if (status >= 300 && status < 400 && LOGIN_LOCATION.test(location)) {
        const cache = response.headers()['cache-control'] || '';
        if (cache) expect(cache).toMatch(/no-store|private/i);
        return;
      }

      if (status < 300 || status >= 400 || !location) break;

      const next = new URL(location, response.url());
      if (pathnameKey(next.href, response.url()) !== pathnameKey(path, response.url())) break;
      if (seen.has(next.href)) break;
      seen.add(next.href);
      target = next.href;
    }

    await new Promise((resolve) => setTimeout(resolve, PROPAGATION_POLL_MS));
    target = path;
  }

  throw new Error(`Timed out waiting for ${path} to redirect anonymous callers to login (last: ${lastDetail})`);
}
