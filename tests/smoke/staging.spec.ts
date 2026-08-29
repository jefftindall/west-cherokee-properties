import { expect, test } from '@playwright/test';
import {
  expectAnonymousAuthRedirect,
  expectsStagingNoIndex,
  isStaticWebAppHost,
  waitForOk,
  waitForRequestOk,
} from '../helpers/propagation';

test.describe('public smoke', () => {
  test('home shows brand and communities', async ({ page }) => {
    await waitForOk(page, '/');
    await expect(page.getByRole('heading', { name: /West Cherokee Properties/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Start an application/i })).toBeVisible();
    await expect(page.getByText(/124 W Cherokee/i)).toBeVisible();
    await expect(page.getByText(/11 Noble/i)).toBeVisible();
    await expect(page.getByText(/10 Falcon Circle/i)).toBeVisible();
  });

  test('properties, about, apply, and contact render', async ({ page }) => {
    await waitForOk(page, '/properties');
    await expect(page.getByRole('heading', { name: 'Properties' })).toBeVisible();
    await waitForOk(page, '/properties/124-w-cherokee');
    await expect(page.getByRole('heading', { name: /124 W Cherokee/i })).toBeVisible();
    await waitForOk(page, '/about');
    await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
    await waitForOk(page, '/apply');
    await expect(page.getByRole('heading', { name: /Rental application/i })).toBeVisible();
    await waitForOk(page, '/contact');
    await expect(page.getByRole('heading', { name: 'Contact' })).toBeVisible();
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
    await expectAnonymousAuthRedirect(request, '/office');
    await expectAnonymousAuthRedirect(request, '/portal');
  });
});
