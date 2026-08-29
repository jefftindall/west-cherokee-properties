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

export async function expectAnonymousAuthRedirect(
  request: APIRequestContext,
  path: string,
) {
  const response = await request.get(path, { maxRedirects: 0 });
  expect(response.status(), `${path} should redirect anonymous callers`).toBeGreaterThanOrEqual(300);
  expect(response.status()).toBeLessThan(400);
  const location = response.headers()['location'] || '';
  expect(location, `${path} location`).toMatch(/\/(\.auth\/login|login)/i);
  const cache = response.headers()['cache-control'] || '';
  if (cache) expect(cache).toMatch(/no-store|private/i);
}
