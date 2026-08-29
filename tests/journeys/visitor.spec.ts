import { expect, test } from '@playwright/test';
import { waitForOk } from '../helpers/propagation';

test.describe('visitor journey', () => {
  test('visitor can go from home to a property and apply @content', async ({ page }) => {
    await waitForOk(page, '/');
    await page.getByRole('link', { name: /See our properties/i }).click();
    await expect(page).toHaveURL(/\/properties/);
    await page.getByRole('link', { name: /124 W Cherokee/i }).first().click();
    await expect(page.getByRole('heading', { name: /124 W Cherokee/i })).toBeVisible();
    await expect(page.getByText(/Unit A — 2 bed, 1 bath/i)).toBeVisible();
    await expect(page.getByText(/Unit B — 3 bed, 2 bath/i)).toBeVisible();
    await page.getByRole('link', { name: /Apply to rent here/i }).click();
    await expect(page).toHaveURL(/\/apply/);
    await expect(page.getByLabel(/Full legal name/i)).toBeVisible();
  });

  test('visitor can open contact @content @mobile', async ({ page }) => {
    await waitForOk(page, '/');
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Contact' }).click();
    await expect(page.getByRole('heading', { name: 'Contact' })).toBeVisible();
    await expect(page.getByLabel('Name')).toBeVisible();
  });
});
