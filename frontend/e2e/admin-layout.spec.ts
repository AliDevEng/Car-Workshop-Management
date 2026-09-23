import { expect, test, type Page } from '@playwright/test';

/**
 * The cross-device regression guard the UI/UX audit asks for.
 *
 * Four of the audit's findings were invisible to every existing test and to
 * a desktop-sized review, and all four are cheap to assert:
 *
 *  - **G1** the admin header overflowed a 390 px viewport, pushing "Logga
 *    ut" off-screen;
 *  - **G2** the sidebar scrolled away, so on a long page there was no
 *    navigation;
 *  - **G4** every dialog, sheet, popover and select rendered in the *public*
 *    palette, because Radix portals mount outside the `.admin-scope` div;
 *  - **R1** internal milestone ids ("…kopplas in i F11.6") were shown to
 *    users as Swedish copy.
 *
 * The copy rule is also enforced as a source scan
 * (`src/lib/admin/user-facing-copy.test.ts`), which is faster and catches a
 * placeholder before it is ever rendered; this checks what a user sees.
 */

const ADMIN_EMAIL = 'admin@verkstaden.se';
const ADMIN_PASSWORD = 'utveckling-admin-2026';

/** `--color-steel-2` from `styles/tokens.css`, the admin raised surface. */
const ADMIN_POPOVER_BACKGROUND = 'rgb(42, 60, 70)';

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

const ROUTES = [
  '/admin',
  '/admin/bokningar',
  '/admin/arbetsordrar',
  '/admin/kunder',
  '/admin/fordon',
  '/admin/lager',
  '/admin/installningar',
] as const;

const MILESTONE_PATTERN = /\b[FB]\d{1,2}\.\d(?:\.\d)?\b/;

test.describe.configure({ mode: 'serial' });

async function login(page: Page): Promise<void> {
  await page.goto('/admin/logga-in?returnTo=%2Fadmin');
  await page.getByLabel('E-post').fill(ADMIN_EMAIL);
  await page.getByLabel('Lösenord').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Logga in' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

/**
 * One login, one visit per route, and the viewports checked by **resizing**
 * rather than reloading.
 *
 * Every responsive rule this spec exercises is CSS, so a resize re-evaluates
 * all of it; reloading each route at each width would cost 28 page loads and
 * their data instead of 7. That matters because the backend's global ceiling
 * is 300 requests per minute per IP (§5.4) and the whole suite shares one
 * address — a fatter version of this spec pushed the *public*
 * booking-request tests into a `429` simply by running just before them.
 *
 * The assertion messages carry the route and the width, so reporting this as
 * a single test loses nothing.
 */
test('admin routes fit every supported viewport', async ({ page }) => {
  await login(page);

  for (const route of ROUTES) {
    await page.goto(route);
    // The page's own `<h1>`, not `networkidle`: a screen with a background
    // refetch never goes idle, and waiting for the heading is what actually
    // means "this route has rendered".
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Width-independent, so it is checked once per route rather than four
    // times: no development milestone id in anything a user can read.
    const visibleText = (await page.locator('main').innerText()) ?? '';
    expect(
      MILESTONE_PATTERN.test(visibleText),
      `${route} shows a development milestone id`,
    ).toBe(false);

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(
        overflow.scrollWidth,
        `${route} scrolls sideways at ${String(viewport.width)} px`,
      ).toBeLessThanOrEqual(overflow.clientWidth);

      // The navigation must still be reachable from the bottom of a long
      // page: either the persistent sidebar, or the menu button that opens
      // it on a phone.
      await page.evaluate(() => {
        const main = document.querySelector('main');
        main?.scrollTo(0, main.scrollHeight);
      });
      const nav =
        viewport.width >= 768
          ? page.getByRole('navigation', { name: 'Admin' }).first()
          : page.getByRole('button', { name: 'Öppna meny' });
      await expect(
        nav,
        `${route} loses its navigation at ${String(viewport.width)} px`,
      ).toBeVisible();
    }
  }
});

test('an unmatched admin URL gets the panel’s own Swedish 404', async ({
  page,
}) => {
  await login(page);
  await page.goto('/admin/finns-inte');

  // Inside the shell, in Swedish. A nested `not-found.tsx` alone does not do
  // this — an address matching no route falls through to the root one,
  // outside every layout, which is Next's white English default page
  // (UI_UX_AUDIT G6). The catch-all route is what routes it back in.
  await expect(
    page.getByRole('heading', { name: 'Sidan finns inte' }),
  ).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Admin' })).toBeVisible();
  await expect(page.getByText('This page could not be found')).toHaveCount(0);
});

test('an overlay uses the admin palette, not the public one', async ({
  page,
}) => {
  await login(page);
  await page.goto('/admin/kunder');

  await page.getByRole('button', { name: 'Ny kund' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Radix portals mount into `document.body`; before G4 was fixed this
  // resolved the `:root` (public) tokens and came back off-white.
  const background = await dialog.evaluate(
    (element) => window.getComputedStyle(element).backgroundColor,
  );
  expect(background).toBe(ADMIN_POPOVER_BACKGROUND);
});
