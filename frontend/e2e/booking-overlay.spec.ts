import { expect, test } from '@playwright/test';
import {
  addStockholmDays,
  publicBookingRequestInputSchema,
  stockholmDate,
} from 'shared';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/public/booking-form-token', async (route) => {
    await route.fulfill({
      json: { token: 'overlay-token', issuedAt: '2026-09-09T08:00:00.000Z' },
    });
  });
});

test('home offers booking without requesting vehicle data, and restores focus after Escape', async ({
  page,
}) => {
  const lookupRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('vehicle-lookup'))
      lookupRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByLabel('Sök på din bil')).toHaveCount(0);
  const trigger = page.getByRole('button', { name: 'Boka nu', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Namn')).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    dialog.getByRole('heading', { name: 'Boka en tid som passar dig.' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  expect(
    await dialog.evaluate((el) => el.contains(document.activeElement)),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(lookupRequests).toEqual([]);
});

test('all public booking calls to action open a dialog on the current page', async ({
  page,
}) => {
  for (const path of [
    '/',
    '/om-oss',
    '/tjanster',
    '/tjanster/bilservice',
    '/kontakt',
  ]) {
    await page.goto(path);
    const triggers = page.locator('button[aria-haspopup="dialog"]');
    for (const trigger of await triggers.all()) {
      if (!(await trigger.isVisible())) continue;
      await trigger.click();
      await expect(
        page.locator('.booking-dialog').getByLabel('Namn'),
      ).toBeVisible();
      expect(new URL(page.url()).pathname).toBe(path);
      await page
        .getByRole('button', { name: 'Stäng bokningsformuläret' })
        .click();
      await expect(page.locator('.booking-dialog')).toBeHidden();
    }
  }
});

test('mobile menu hands focus to the form and returns it to the menu control', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const menu = page.locator('.mobile-nav > summary');
  await menu.click();
  await page
    .locator('.mobile-nav-panel')
    .getByRole('button', { name: 'Boka tid' })
    .click();
  await expect(page.locator('.mobile-nav-panel')).toBeHidden();
  await expect(page.getByRole('dialog').getByLabel('Namn')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(menu).toBeFocused();
});

test('service selection, calendar and submission work without navigating away', async ({
  page,
}) => {
  const tomorrow = addStockholmDays(stockholmDate(new Date()), 1);
  await page.route('**/api/public/booking-requests', async (route) => {
    const body: unknown = route.request().postDataJSON();
    expect(publicBookingRequestInputSchema.parse(body)).toMatchObject({
      customerName: 'Anna Andersson',
      phone: '070-123 45 67',
      serviceTypeIds: ['bilservice'],
      requestedDate: tomorrow,
    });
    await route.fulfill({ status: 201, json: { received: true } });
  });
  await page.goto('/tjanster/bilservice');
  await page.getByRole('button', { name: 'Boka bilservice' }).click();
  const dialog = page.locator('.booking-dialog');
  await expect(
    dialog.getByRole('checkbox', { name: 'Bilservice', exact: true }),
  ).toBeChecked();
  await dialog.getByLabel('Namn').fill('Anna Andersson');
  await dialog.getByLabel('Telefon', { exact: false }).fill('070-123 45 67');
  await dialog.getByRole('button', { name: 'Önskad dag' }).click();
  await page.locator(`[data-date="${tomorrow}"]`).click();
  await dialog.getByRole('button', { name: 'Skicka förfrågan' }).click();
  await expect(
    dialog.getByRole('heading', { name: 'Tack. Vi ringer tillbaka.' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/tjanster\/bilservice$/);
  await dialog.getByRole('button', { name: 'Tillbaka till sidan' }).click();
  await expect(dialog).toBeHidden();
});

test('failed requests keep entered values and let visitors retry', async ({
  page,
}) => {
  await page.route('**/api/public/booking-requests', async (route) => {
    await route.fulfill({
      status: 503,
      json: {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Försök igen.',
          requestId: 'overlay-test',
        },
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Boka nu', exact: true }).click();
  const dialog = page.locator('.booking-dialog');
  await dialog.getByLabel('Namn').fill('Anna Andersson');
  await dialog.getByLabel('Telefon', { exact: false }).fill('070-123 45 67');
  await dialog.getByRole('button', { name: 'Skicka förfrågan' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByLabel('Namn')).toHaveValue('Anna Andersson');
  await expect(
    dialog.getByRole('button', { name: 'Skicka förfrågan' }),
  ).toBeEnabled();
  await expect(
    dialog.getByRole('button', { name: 'Stäng bokningsformuläret' }),
  ).toBeEnabled();
});

test('form and close control remain reachable at narrow, wide and short resolutions', async ({
  page,
}) => {
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [667, 375],
    [768, 1024],
    [1024, 768],
    [1440, 900],
    [1920, 1080],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.getByRole('button', { name: 'Boka nu', exact: true }).click();
    const dialog = page.locator('.booking-dialog');
    await expect(dialog.getByLabel('Namn')).toBeVisible();
    const submit = dialog.getByRole('button', { name: 'Skicka förfrågan' });
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeInViewport();
    await expect(
      dialog.getByRole('button', { name: 'Stäng bokningsformuläret' }),
    ).toBeInViewport();
    const overflow = await dialog.evaluate((el) => ({
      width: el.scrollWidth - el.clientWidth,
      height: el.getBoundingClientRect().height - innerHeight,
    }));
    expect(overflow.width).toBeLessThanOrEqual(1);
    expect(overflow.height).toBeLessThanOrEqual(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  }
});

test('reduced motion and direct booking links remain usable', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/boka?regnr=ABC123&tjanst=bilservice');
  await expect(page.getByLabel('Registreringsnummer')).toHaveValue('ABC 123');
  await page
    .locator('.site-header')
    .getByRole('button', { name: 'Boka tid' })
    .click();
  const dialog = page.locator('.booking-dialog');
  await expect(dialog.getByLabel('Namn')).toBeVisible();
  const duration = await dialog.evaluate(
    (el) => getComputedStyle(el).animationDuration,
  );
  expect(Number.parseFloat(duration)).toBeLessThan(0.01);
  const duplicateIds = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
    return ids.filter((id, index) => ids.indexOf(id) !== index);
  });
  expect(duplicateIds).toEqual([]);
});
