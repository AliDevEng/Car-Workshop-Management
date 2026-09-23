import { expect, test, type Page } from '@playwright/test';

/**
 * F0.3.3: å, ä and ö render in every weight.
 *
 * Reading the file's `cmap` proves the glyphs are *in* the file; it does not
 * prove the browser reaches them. These checks run in a real browser against
 * the built `@font-face` rules, and cover the two ways this actually breaks:
 *
 *  - a subset that dropped `latin-ext`, so `ÅÄÖ` falls back to Arial;
 *  - a missing `font-weight` descriptor, which makes the browser treat a
 *    variable font as a single 400 face and synthesise every other weight.
 */

const WEIGHTS = [400, 500, 600, 700] as const;
const SWEDISH = 'ÅÄÖåäö';
const ADMIN_EMAIL = 'admin@verkstaden.se';
const ADMIN_PASSWORD = 'utveckling-admin-2026';

async function login(page: Page): Promise<void> {
  await page.goto('/admin/logga-in?returnTo=/admin');
  await page.getByLabel('E-post').fill(ADMIN_EMAIL);
  await page.getByLabel('Lösenord').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Logga in' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

/** The family name `next/font/local` generated, from the CSS variable. */
async function familyOf(page: Page, cssVariable: string): Promise<string> {
  const value = await page.evaluate(
    (name) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
    cssVariable,
  );
  const first = value.split(',')[0];
  expect(first, `${cssVariable} is not set on <html>`).toBeTruthy();
  return (first ?? '').trim().replace(/^["']|["']$/g, '');
}

/**
 * Fetches the face for these weights. A `@font-face` is downloaded lazily, so
 * `document.fonts.check()` answers `false` for a family no element on the page
 * happens to use — Source Serif 4 is the public body face and the admin
 * surface never renders it. Without this the check tests page content rather
 * than the font.
 */
async function loadFace(
  page: Page,
  family: string,
  text: string,
): Promise<void> {
  await page.evaluate(
    async ([name, sample, weights]) => {
      await Promise.all(
        (weights as readonly number[]).map((weight) =>
          document.fonts.load(
            `${String(weight)} 40px "${String(name)}"`,
            String(sample),
          ),
        ),
      );
    },
    [family, text, WEIGHTS] as const,
  );
}

test.describe('self-hosted fonts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
  });

  test('both families declare their real variable weight range', async ({
    page,
  }) => {
    const declared = await page.evaluate(() =>
      [...document.fonts].map((face) => ({
        family: face.family,
        weight: face.weight,
      })),
    );

    const archivo = declared.find(
      (face) => face.family.toLowerCase() === 'archivo',
    );
    const serif = declared.find(
      (face) => face.family.toLowerCase() === 'sourceserif4',
    );

    // A bare `400` here is the bug: the variable axis is then unreachable and
    // bold text is synthetic. The ranges must match each file's `fvar`.
    expect(archivo?.weight).toBe('100 900');
    expect(serif?.weight).toBe('200 900');
  });

  for (const cssVariable of ['--font-archivo', '--font-source-serif-4']) {
    test(`${cssVariable} renders ${SWEDISH} at every weight`, async ({
      page,
    }) => {
      const name = await familyOf(page, cssVariable);
      await loadFace(page, name, SWEDISH);

      for (const weight of WEIGHTS) {
        const usable = await page.evaluate(
          ([font, text]) => document.fonts.check(String(font), String(text)),
          [`${String(weight)} 16px "${name}"`, SWEDISH] as const,
        );
        expect(
          usable,
          `${name} ${String(weight)} cannot render ${SWEDISH}`,
        ).toBe(true);
      }
    });

    test(`${cssVariable} varies its weight axis rather than faking it`, async ({
      page,
    }) => {
      const name = await familyOf(page, cssVariable);
      await loadFace(page, name, SWEDISH);

      const widths = await page.evaluate(
        ([font, text, weights]) => {
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (context === null) {
            throw new Error('2d canvas context unavailable');
          }
          return (weights as readonly number[]).map((weight) => {
            context.font = `${String(weight)} 40px "${String(font)}"`;
            return context.measureText(String(text)).width;
          });
        },
        [name, SWEDISH, WEIGHTS] as const,
      );

      // The `wght` axis changes advance widths. Identical widths across the
      // range mean one instance is being reused for all of them.
      expect(new Set(widths).size).toBeGreaterThan(1);
      for (const width of widths) {
        expect(width).toBeGreaterThan(0);
      }
    });
  }

  test('the admin surface is scoped, not a global theme', async ({ page }) => {
    // `/admin` has required a session since F4 added route protection; this
    // check predates that and only ever exercised the redirect to
    // `/admin/logga-in`, not the scoped surface it names.
    await login(page);

    // The class is on `<body>` as well as the layout wrapper, so that Radix
    // portals — a dialog, a sheet, a select — resolve the admin tokens
    // instead of the public ones (UI_UX_AUDIT G4). Still scoped, not global:
    // it is added while an admin route is mounted and removed on unmount,
    // which the public-surface check below is what actually proves.
    await expect(page.locator('body.admin-scope')).toHaveCount(1);
    const scope = page.locator('.admin-scope').first();
    await expect(scope).toBeVisible();
    // #1c2b33 — the steel token, applied on admin routes only.
    await expect(scope).toHaveCSS('background-color', 'rgb(28, 43, 51)');
    await expect(
      page.getByRole('heading', { name: 'Adminpanelen' }),
    ).toBeVisible();

    // The public surface keeps its own concrete background (#e6e8e5), and
    // the body class is gone with the admin route that set it.
    await page.goto('/');
    await expect(page.locator('body.admin-scope')).toHaveCount(0);
    await expect(page.locator('body')).toHaveCSS(
      'background-color',
      'rgb(230, 232, 229)',
    );
  });
});
