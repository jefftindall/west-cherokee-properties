import { expect, test } from '@playwright/test';
import {
  expectAnonymousAuthRedirect,
  expectsStagingNoIndex,
  isStaticWebAppHost,
  PROPAGATION_DEADLINE_MS,
  waitForOk,
  waitForRequestOk,
} from '../helpers/propagation';

test.describe('public smoke', () => {
  test('home shows brand and communities', async ({ page }) => {
    await waitForOk(page, '/');
    await expect(page.getByRole('heading', { name: 'Your next home' })).toBeVisible();
    await expect(page.getByRole('link', { name: /See our homes/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /124 W Cherokee/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /11 Noble/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /10 Falcon Circle/i })).toBeVisible();
  });

  test('properties, about, apply, and contact render', async ({ page }) => {
    await waitForOk(page, '/properties');
    await expect(page.getByRole('heading', { name: 'Our homes' })).toBeVisible();
    await waitForOk(page, '/properties/124-w-cherokee');
    await expect(page.getByRole('heading', { name: /124 W Cherokee/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Get directions/i })).toBeVisible();
    await waitForOk(page, '/about');
    await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
    await waitForOk(page, '/apply');
    await expect(page.getByRole('heading', { name: /Nothing for rent/i })).toBeVisible();
    await waitForOk(page, '/contact');
    await expect(page.getByRole('heading', { name: 'Contact' })).toBeVisible();
    await waitForOk(page, '/neighborhoods');
    await expect(page.getByRole('heading', { name: 'Two parts of town' })).toBeVisible();
    await waitForOk(page, '/neighborhoods/historic-downtown');
    await expect(page.getByRole('heading', { name: 'Historic Downtown' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Downtown Cartersville events calendar/i })).toBeVisible();
    await waitForOk(page, '/neighborhoods/north-cartersville');
    await expect(page.getByRole('heading', { name: 'North Cartersville' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Bartow County College and Career Academy/i })).toBeVisible();
  });

  test('robots and sitemap', async ({ request }) => {
    const robots = await waitForRequestOk(request, '/robots.txt');
    const body = await robots.text();
    if (expectsStagingNoIndex()) {
      expect(body).toContain('Disallow: /');
    } else {
      expect(body).toContain('Disallow: /office');
      expect(body).toContain('Disallow: /portal');
    }
    await waitForRequestOk(request, '/sitemap-index.xml');
  });

  test('anonymous office and portal redirect on SWA', async ({ request }) => {
    test.skip(!isStaticWebAppHost(), 'Easy Auth is only enforced on Static Web Apps');
    test.setTimeout(PROPAGATION_DEADLINE_MS + 30_000);
    await expectAnonymousAuthRedirect(request, '/office');
    await expectAnonymousAuthRedirect(request, '/portal');
  });

  test('deep-link shells load anonymously on SWA', async ({ request }) => {
    test.skip(!isStaticWebAppHost(), 'Easy Auth is only enforced on Static Web Apps');
    test.setTimeout(PROPAGATION_DEADLINE_MS + 30_000);
    const unitShell = await waitForRequestOk(request, '/office/unit?unitId=unit-124-w-cherokee-a');
    expect(unitShell.status()).toBeGreaterThanOrEqual(200);
    expect(unitShell.status()).toBeLessThan(400);
    const body = await unitShell.text();
    expect(body).toContain('Manage unit');
  });

  test('login preserves returnUrl for staff sign-in', async ({ page }) => {
    const returnUrl = '/office/unit?unitId=unit-124-w-cherokee-a';
    await waitForOk(page, `/login?returnUrl=${encodeURIComponent(returnUrl)}`);
    const href = await page.locator('#staff-login').getAttribute('href');
    expect(href).toContain(encodeURIComponent(returnUrl));
  });
});
