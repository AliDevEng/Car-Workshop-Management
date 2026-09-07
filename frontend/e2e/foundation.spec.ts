import { expect, test } from '@playwright/test';

/**
 * F0 smoke test: the app boots and renders, whether or not the backend is
 * reachable yet. Real journeys (booking, login, …) arrive with the
 * iterations that build those pages.
 */
test('the home page renders in Swedish and shows a connectivity state', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('lang', 'sv');
  await expect(page.getByRole('heading', { name: 'Verkstadssystem' })).toBeVisible();

  // Either the backend answered (a status list) or it didn't (an alert) —
  // both are valid, explicitly-handled outcomes for this stage.
  await expect(page.getByRole('alert').or(page.getByText('Status'))).toBeVisible();
});
