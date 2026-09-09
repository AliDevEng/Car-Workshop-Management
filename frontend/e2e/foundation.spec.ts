import { expect, test } from '@playwright/test';

/** F0 stays covered after F2 replaces the temporary health-check page. */
test('the application boots into the Swedish public site', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('lang', 'sv');
  await expect(
    page.getByRole('heading', { name: 'Din bil. Vårt hantverk.' }),
  ).toBeVisible();
  await expect(page.getByRole('main')).toBeVisible();
});
