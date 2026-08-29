import { expect, test } from '@playwright/test';
import { waitForOk } from '../helpers/propagation';

test.describe('visitor journey', () => {
  test('visitor can go from home to a leased property and contact @content', async ({ page }) => {
    await waitForOk(page, '/');
    await page.getByRole('link', { name: /See our homes/i }).first().click();
    await expect(page).toHaveURL(/\/properties/);
    await page.getByRole('link', { name: /124 W Cherokee/i }).first().click();
    await expect(page.getByRole('heading', { name: /124 W Cherokee/i })).toBeVisible();
    await expect(page.getByText(/Unit A — 2 bed, 1 bath/i)).toBeVisible();
    await expect(page.getByText(/Unit B — 3 bed, 2 bath/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /Get directions/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Photos on Zillow/i })).toBeVisible();
    await expect(page.getByText(/currently leased/i).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Apply to rent here/i })).toHaveCount(0);
    await page.getByRole('link', { name: /Tell us which home you like/i }).click();
    await expect(page).toHaveURL(/\/contact/);
    await expect(page.getByLabel('Name')).toBeVisible();
  });

  test('visitor can open a neighborhood from home @content', async ({ page }) => {
    await waitForOk(page, '/');
    await page.getByRole('link', { name: /Things to do nearby/i }).first().click();
    await expect(page).toHaveURL(/\/neighborhoods\/historic-downtown/);
    await expect(page.getByRole('heading', { name: 'Historic Downtown' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Downtown Cartersville events calendar/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Noble & Main Coffee Co/i })).toBeVisible();
    await page.getByRole('navigation', { name: 'Other neighborhoods' }).getByRole('link', { name: 'North Cartersville' }).click();
    await expect(page).toHaveURL(/\/neighborhoods\/north-cartersville/);
    await expect(page.getByRole('heading', { name: 'North Cartersville' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Savoy Automobile Museum/i })).toBeVisible();
  });

  test('visitor can open contact @content @mobile', async ({ page }) => {
    await waitForOk(page, '/');
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Contact' }).click();
    await expect(page.getByRole('heading', { name: 'Contact' })).toBeVisible();
    await expect(page.getByLabel('Name')).toBeVisible();
  });
});
