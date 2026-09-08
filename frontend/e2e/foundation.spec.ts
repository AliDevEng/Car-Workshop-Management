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
  await expect(
    page.getByRole('heading', { name: 'Verkstadssystem' }),
  ).toBeVisible();

  // Either the backend answered (a status list) or it didn't (an alert) —
  // both are valid, explicitly-handled outcomes for this stage.
  //
  // Scoped to <main> on purpose. Next.js renders its own permanently-present
  // `__next-route-announcer__` with `role="alert"`, so an unscoped
  // `getByRole('alert')` is satisfied on every page by something this app
  // did not render — an assertion that can never fail is not a test.
  const content = page.getByRole('main');
  await expect(
    content.getByText('Status').or(content.getByRole('alert')),
  ).toBeVisible();
});
