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
  const trigger = page
    .locator('.hero-section')
    .getByRole('button', { name: 'Skicka bokningsförfrågan', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Namn')).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    dialog.getByRole('heading', { name: 'Skicka bokningsförfrågan' }),
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
      await expect(trigger).toHaveText('Skicka bokningsförfrågan');
      await trigger.click();
      await expect(
        page
          .getByRole('dialog')
          .getByText(
            'Vi ringer dig och kommer överens om en tid. Bokningen gäller när vi har bekräftat den.',
          ),
      ).toBeVisible();
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
    .getByRole('button', { name: 'Skicka bokningsförfrågan' })
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
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Skicka bokningsförfrågan', exact: true })
    .click();
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
  await page
    .locator('.hero-section')
    .getByRole('button', { name: 'Skicka bokningsförfrågan', exact: true })
    .click();
  const dialog = page.locator('.booking-dialog');
  await dialog.getByLabel('Namn').fill('Anna Andersson');
  await dialog.getByLabel('Telefon', { exact: false }).fill('070-123 45 67');
  await dialog.getByRole('button', { name: 'Skicka förfrågan' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByRole('alert')).toBeFocused();
  await expect(dialog.getByRole('alert')).toBeInViewport();
  await expect(dialog.getByLabel('Namn')).toHaveValue('Anna Andersson');
  await expect(
    dialog.getByRole('button', { name: 'Skicka förfrågan' }),
  ).toBeEnabled();
  await expect(
    dialog.getByRole('button', { name: 'Stäng bokningsformuläret' }),
  ).toBeEnabled();
});

test('validation reveals the first invalid field and offers links to every error', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Local errors must remain actionable even when the token service is down.
  await page.route('**/api/public/booking-form-token', (route) =>
    route.abort(),
  );
  await page.goto('/');
  await page
    .locator('.hero-section')
    .getByRole('button', { name: 'Skicka bokningsförfrågan', exact: true })
    .click();
  const dialog = page.locator('.booking-dialog');
  await dialog.getByLabel('Meddelande').fill('Kontrollera bromsarna.');
  await dialog.getByRole('button', { name: 'Skicka förfrågan' }).click();

  await expect(dialog.getByLabel('Namn')).toBeFocused();
  await expect(dialog.getByLabel('Namn')).toBeInViewport();
  const summary = dialog.getByRole('alert');
  await expect(summary.getByRole('link', { name: /^Namn:/ })).toBeVisible();
  await summary.getByRole('link', { name: /^Telefon:/ }).click();
  await expect(dialog.getByLabel('Telefon')).toBeFocused();
  await expect(dialog.getByLabel('Telefon')).toBeInViewport();

  await dialog.getByLabel('Namn').fill('Anna Andersson');
  await dialog.getByRole('button', { name: 'Skicka förfrågan' }).click();
  await expect(dialog.getByLabel('Telefon')).toBeFocused();
  await expect(summary.getByRole('link', { name: /^Namn:/ })).toHaveCount(0);
});

test('server field errors follow the visual field order and keep the draft', async ({
  page,
}) => {
  await page.route('**/api/public/booking-requests', async (route) => {
    await route.fulfill({
      status: 400,
      json: {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Kontrollera uppgifterna och försök igen.',
          requestId: 'field-validation',
          details: [
            { path: 'phone', message: 'Kontrollera telefonnumret.' },
            { path: 'customerName', message: 'Kontrollera namnet.' },
          ],
        },
      },
    });
  });
  await page.goto('/');
  await page
    .locator('.hero-section')
    .getByRole('button', { name: 'Skicka bokningsförfrågan', exact: true })
    .click();
  const dialog = page.locator('.booking-dialog');
  await dialog.getByLabel('Namn').fill('Anna Andersson');
  await dialog.getByLabel('Telefon').fill('070-123 45 67');
  await dialog.getByRole('button', { name: 'Skicka förfrågan' }).click();
  await expect(dialog.getByLabel('Namn')).toBeFocused();
  await expect(dialog.getByLabel('Namn')).toBeInViewport();
  await expect(dialog.getByLabel('Telefon')).toHaveValue('070-123 45 67');
  await expect(
    dialog.getByRole('alert').getByRole('link', { name: /Kontrollera/ }),
  ).toHaveCount(2);
});

test('a draft survives closing and navigation, merges a service choice and clears after success', async ({
  page,
}) => {
  const tomorrow = addStockholmDays(stockholmDate(new Date()), 1);
  await page.route('**/api/public/booking-requests', async (route) => {
    const body: unknown = route.request().postDataJSON();
    expect(publicBookingRequestInputSchema.parse(body)).toMatchObject({
      customerName: 'Anna Andersson',
      phone: '070-123 45 67',
      email: 'anna@example.se',
      regNr: 'ABC123',
      requestedDate: tomorrow,
      requestedTimeOfDay: 'AFTERNOON',
      serviceTypeIds: ['bromsar', 'bilservice'],
      message: 'Bromsarna låter.',
    });
    await route.fulfill({ status: 201, json: { received: true } });
  });
  await page.goto('/');
  const trigger = page
    .locator('.hero-section')
    .getByRole('button', { name: 'Skicka bokningsförfrågan', exact: true });
  await trigger.click();
  const dialog = page.locator('.booking-dialog');
  await dialog.getByLabel('Namn').fill('Anna Andersson');
  await dialog.getByLabel('Telefon').fill('070-123 45 67');
  await dialog.getByLabel('E-post').fill('anna@example.se');
  await dialog.getByLabel('Registreringsnummer').fill('ABC123');
  await dialog.getByRole('button', { name: 'Önskad dag' }).click();
  await page.locator(`[data-date="${tomorrow}"]`).click();
  await dialog.getByLabel('Tid på dagen').selectOption('AFTERNOON');
  await dialog.getByRole('checkbox', { name: 'Bromsar', exact: true }).check();
  await dialog.getByLabel('Meddelande').fill('Bromsarna låter.');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await trigger.click();
  await expect(dialog.getByLabel('Namn')).toHaveValue('Anna Andersson');
  await expect(dialog.getByLabel('Registreringsnummer')).toHaveValue('ABC 123');
  await expect(dialog.getByLabel('Tid på dagen')).toHaveValue('AFTERNOON');
  await expect(dialog.getByLabel('Meddelande')).toHaveValue('Bromsarna låter.');
  await dialog
    .getByRole('button', { name: 'Stäng bokningsformuläret' })
    .click();
  await expect(dialog).toBeHidden();

  await page.getByRole('link', { name: 'Läs mer om Bilservice' }).click();
  await expect(page).toHaveURL(/\/tjanster\/bilservice$/);
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Skicka bokningsförfrågan', exact: true })
    .click();
  await expect(
    dialog.getByRole('checkbox', { name: 'Bromsar', exact: true }),
  ).toBeChecked();
  await expect(
    dialog.getByRole('checkbox', { name: 'Bilservice', exact: true }),
  ).toBeChecked();
  await dialog.getByRole('button', { name: 'Skicka förfrågan' }).click();
  await expect(
    dialog.getByRole('heading', { name: 'Tack. Vi ringer tillbaka.' }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Tillbaka till sidan' }).click();
  await expect(dialog).toBeHidden();
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Skicka bokningsförfrågan', exact: true })
    .click();
  await expect(dialog.getByLabel('Namn')).toHaveValue('');
  await expect(dialog.getByLabel('Telefon')).toHaveValue('');
  await expect(dialog.getByLabel('E-post')).toHaveValue('');
  await expect(dialog.getByLabel('Registreringsnummer')).toHaveValue('');
  await expect(dialog.getByLabel('Meddelande')).toHaveValue('');
  await expect(
    dialog.getByRole('checkbox', { name: 'Bromsar', exact: true }),
  ).not.toBeChecked();
  await expect(
    dialog.getByRole('checkbox', { name: 'Bilservice', exact: true }),
  ).toBeChecked();
});

test('an untouched preselected service survives a generic reopen but not a reload', async ({
  page,
}) => {
  await page.goto('/tjanster/bilservice');
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Skicka bokningsförfrågan', exact: true })
    .click();
  const dialog = page.locator('.booking-dialog');
  await expect(
    dialog.getByRole('checkbox', { name: 'Bilservice', exact: true }),
  ).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page
    .locator('.site-header')
    .getByRole('button', { name: 'Skicka bokningsförfrågan' })
    .click();
  await expect(
    dialog.getByRole('checkbox', { name: 'Bilservice', exact: true }),
  ).toBeChecked();
  await dialog.getByLabel('Namn').fill('Anna Andersson');
  await page.reload();
  await page
    .locator('.site-header')
    .getByRole('button', { name: 'Skicka bokningsförfrågan' })
    .click();
  await expect(dialog.getByLabel('Namn')).toHaveValue('');
  await expect(
    dialog.getByRole('checkbox', { name: 'Bilservice', exact: true }),
  ).not.toBeChecked();
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
    await page
      .locator('.hero-section')
      .getByRole('button', { name: 'Skicka bokningsförfrågan', exact: true })
      .click();
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
    .getByRole('button', { name: 'Skicka bokningsförfrågan' })
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
