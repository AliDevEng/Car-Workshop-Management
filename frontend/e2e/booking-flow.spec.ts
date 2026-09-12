import { expect, test, type Page, type Route } from '@playwright/test';
import {
  formTokenResponseSchema,
  publicBookingRequestInputSchema,
} from 'shared';

async function fulfilJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

function tokenResponse(token: string) {
  return formTokenResponseSchema.parse({
    token,
    issuedAt: '2026-09-09T08:00:00.000Z',
  });
}

async function mockToken(
  page: Page,
  tokens: readonly string[] = ['booking-token'],
) {
  let index = 0;
  await page.route('**/api/public/booking-form-token', async (route) => {
    const token = tokens[Math.min(index, tokens.length - 1)] ?? 'booking-token';
    index += 1;
    await fulfilJson(route, tokenResponse(token));
  });
}

async function fillRequiredBookingFields(page: Page) {
  await page.getByLabel('Namn').fill('Anna Andersson');
  await page.getByLabel('Telefon').fill('070-123 45 67');
}

async function submitBooking(page: Page) {
  const button = page.getByRole('button', { name: 'Skicka förfrågan' });
  await expect(button).toBeEnabled();
  await button.click();
}

test.describe('public booking flow', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(60_000);

  test('submits a prefilled booking request and shows the staff-review confirmation', async ({
    page,
  }) => {
    await mockToken(page);
    await page.route('**/api/public/booking-requests', async (route) => {
      const rawBody = route.request().postData();
      const requestBody: unknown =
        rawBody === null ? null : JSON.parse(rawBody);
      expect(publicBookingRequestInputSchema.parse(requestBody)).toEqual({
        website: '',
        formToken: 'booking-token',
        regNr: 'ABC123',
        customerName: 'Anna Andersson',
        phone: '070-123 45 67',
        serviceTypeIds: ['bilservice'],
      });
      await fulfilJson(route, { received: true }, 201);
    });

    await page.goto('/boka?regnr=ABC123&tjanst=bilservice');
    await fillRequiredBookingFields(page);
    await expect(page.getByLabel('Registreringsnummer')).toHaveValue('ABC 123');
    await expect(
      page.getByRole('checkbox', { name: 'Bilservice' }),
    ).toBeChecked();
    await submitBooking(page);

    await expect(page).toHaveURL(/\/boka\/tack$/);
    await expect(
      page.getByRole('heading', { name: 'Tack. Vi ringer tillbaka.' }),
    ).toBeVisible();
    await expect(
      page.getByText('Tiden är bokad först när vi har bekräftat den med dig.'),
    ).toBeVisible();
  });

  test('rejects a filled honeypot before submitting to the API', async ({
    page,
  }) => {
    await mockToken(page);
    let requests = 0;
    await page.route('**/api/public/booking-requests', async (route) => {
      requests += 1;
      await fulfilJson(route, { received: true }, 201);
    });

    await page.goto('/boka');
    await fillRequiredBookingFields(page);
    await page.locator('#booking-website').fill('https://example.com');
    await submitBooking(page);

    await expect(
      page.getByText('Kontrollera uppgifterna och försök igen.'),
    ).toBeVisible();
    expect(requests).toBe(0);
  });

  test('explains an early token rejection without losing entered values', async ({
    page,
  }) => {
    await mockToken(page);
    await page.route('**/api/public/booking-requests', async (route) => {
      await fulfilJson(
        route,
        {
          error: {
            code: 'VALIDATION_FAILED',
            message:
              'Formuläret kunde inte verifieras. Ladda om sidan och försök igen.',
            details: [
              {
                path: 'formToken',
                message:
                  'Formuläret kunde inte verifieras. Ladda om sidan och försök igen.',
              },
            ],
            requestId: 'early-token',
          },
        },
        400,
      );
    });

    await page.goto('/boka');
    await fillRequiredBookingFields(page);
    await submitBooking(page);

    await expect(page.getByText('Formuläret behöver uppdateras')).toBeVisible();
    await expect(
      page.getByRole('alert').getByRole('link', { name: /Ring/ }),
    ).toBeVisible();
    await expect(page.getByLabel('Namn')).toHaveValue('Anna Andersson');
  });

  test('refreshes an expired token and retries deliberately', async ({
    page,
  }) => {
    await mockToken(page, ['expired-token', 'fresh-token']);
    let attempts = 0;
    await page.route('**/api/public/booking-requests', async (route) => {
      attempts += 1;
      const rawBody = route.request().postData();
      const requestBody: unknown =
        rawBody === null ? null : JSON.parse(rawBody);
      const parsed = publicBookingRequestInputSchema.parse(requestBody);

      if (attempts === 1) {
        expect(parsed.formToken).toBe('expired-token');
        await fulfilJson(
          route,
          {
            error: {
              code: 'VALIDATION_FAILED',
              message:
                'Formuläret kunde inte verifieras. Ladda om sidan och försök igen.',
              details: [
                {
                  path: 'formToken',
                  message:
                    'Formuläret kunde inte verifieras. Ladda om sidan och försök igen.',
                },
              ],
              requestId: 'expired-token',
            },
          },
          400,
        );
        return;
      }

      expect(parsed.formToken).toBe('fresh-token');
      await fulfilJson(route, { received: true }, 201);
    });

    await page.goto('/boka');
    await fillRequiredBookingFields(page);
    await submitBooking(page);
    await page.getByRole('button', { name: 'Hämta nytt' }).click();
    await submitBooking(page);

    await expect(page).toHaveURL(/\/boka\/tack$/);
    expect(attempts).toBe(2);
  });

  test('keeps the phone fallback visible on rate limits', async ({ page }) => {
    await mockToken(page);
    await page.route('**/api/public/booking-requests', async (route) => {
      await fulfilJson(
        route,
        {
          error: {
            code: 'RATE_LIMITED',
            message:
              'Vi har tagit emot flera förfrågningar från dig. Ring oss gärna, eller försök igen om en stund.',
            requestId: 'rate-limited',
          },
        },
        429,
      );
    });

    await page.goto('/boka');
    await fillRequiredBookingFields(page);
    await submitBooking(page);

    await expect(page.getByText('För många försök')).toBeVisible();
    await expect(
      page.getByRole('alert').getByRole('link', { name: /Ring/ }),
    ).toHaveAttribute('href', /^tel:/);
    await expect(page.getByLabel('Telefon')).toHaveValue('070-123 45 67');
  });

  test('is usable at 360 px and by keyboard', async ({ page }) => {
    await mockToken(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.route('**/api/public/booking-requests', async (route) => {
      await fulfilJson(route, { received: true }, 201);
    });

    await page.goto('/boka?regnr=DEF456');
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('link', { name: 'Hoppa till innehållet' }),
    ).toBeFocused();

    await fillRequiredBookingFields(page);
    await page.getByLabel('Meddelande').fill('Kontrollera bromsarna.');
    await submitBooking(page);
    await expect(page).toHaveURL(/\/boka\/tack$/);
  });
});
