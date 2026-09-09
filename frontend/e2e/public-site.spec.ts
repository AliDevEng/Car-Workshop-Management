import { expect, test, type Page, type Route } from '@playwright/test';
import {
  formTokenResponseSchema,
  vehicleLookupInputSchema,
  vehicleLookupResponseSchema,
} from 'shared';

const formToken = formTokenResponseSchema.parse({
  token: 'fixture-token',
  issuedAt: '2026-09-09T08:00:00.000Z',
});

async function fulfilJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function mockToken(page: Page) {
  await page.route('**/api/public/booking-form-token', async (route) => {
    await fulfilJson(route, formToken);
  });
}

async function submitLookup(page: Page, registrationNumber = 'ABC 123') {
  await page.getByLabel('Sök på din bil').fill(registrationNumber);
  const submit = page.getByRole('button', { name: 'Hitta bilen' });
  await expect(submit).toBeEnabled();
  await submit.click();
}

test.describe('public routes', () => {
  test.beforeEach(async ({ page }) => {
    await mockToken(page);
  });

  const routes = [
    ['/', 'Din bil. Vårt hantverk.'],
    ['/tjanster', 'Allt bilen behöver. Inget den inte behöver.'],
    ['/tjanster/bilservice', 'Bilservice'],
    ['/om-oss', 'Två ägare. Ett löfte: vi står för jobbet.'],
    ['/kontakt', 'Raka vägen till verkstaden.'],
    ['/integritetspolicy', 'Tydligt om dina uppgifter.'],
  ] as const;

  for (const [path, heading] of routes) {
    test(`${path} is indexable and has one h1`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(
        page.getByRole('heading', { level: 1, name: heading }),
      ).toBeVisible();
      const robots = await page.evaluate(
        () =>
          document.querySelector<HTMLMetaElement>('meta[name="robots"]')
            ?.content ?? '',
      );
      expect(robots).not.toContain('noindex');
      await expect(page.locator('meta[name="description"]')).toHaveAttribute(
        'content',
        /.+/,
      );
    });
  }

  test('service details expose JSON-LD and unknown slugs have a designed 404', async ({
    page,
  }) => {
    await page.goto('/tjanster/bilservice');
    const jsonLd = page.locator('script[type="application/ld+json"]');
    await expect(jsonLd).toHaveCount(2);
    const jsonLdContents = await jsonLd.allTextContents();
    expect(
      jsonLdContents.some((content) => content.includes('"@type":"Service"')),
    ).toBe(true);

    const response = await page.goto('/tjanster/finns-inte');
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole('heading', { name: 'Den tjänsten finns inte.' }),
    ).toBeVisible();
  });

  test('navigation marks the current section on root and nested routes', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(
      page.getByRole('navigation', { name: 'Huvudmeny' }).getByRole('link', {
        name: 'Start',
      }),
    ).toHaveAttribute('aria-current', 'page');

    await page
      .getByRole('navigation', { name: 'Huvudmeny' })
      .getByRole('link', { name: 'Tjänster' })
      .click();
    await expect(page).toHaveURL(/\/tjanster$/);
    await expect(
      page.getByRole('navigation', { name: 'Huvudmeny' }).getByRole('link', {
        name: 'Tjänster',
      }),
    ).toHaveAttribute('aria-current', 'page');

    await page.getByRole('link', { name: 'Läs mer om Bilservice' }).click();
    await expect(page).toHaveURL(/\/tjanster\/bilservice$/);
    await expect(
      page.getByRole('navigation', { name: 'Huvudmeny' }).getByRole('link', {
        name: 'Tjänster',
      }),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('every service card has a relevant image', async ({ page }) => {
    await page.goto('/tjanster');
    const cards = page.locator('.service-card');
    await expect(cards).toHaveCount(6);
    await expect(cards.locator('img')).toHaveCount(6);
    for (const image of await cards.locator('img').all()) {
      await expect(image).toHaveAttribute('alt', /.+/);
    }
  });

  test('staff pages are no-index and absent from public crawl files', async ({
    page,
  }) => {
    await page.goto('/admin');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      /noindex/,
    );

    const sitemap = await (await page.request.get('/sitemap.xml')).text();
    expect(sitemap).toContain('<loc>https://verkstaden.se/tjanster</loc>');
    expect(sitemap).not.toContain('/admin');

    const robots = await (await page.request.get('/robots.txt')).text();
    expect(robots).toContain('Disallow: /admin/');
  });

  test('mobile navigation is keyboard operable and does not overflow', async ({
    page,
  }) => {
    for (const width of [320, 440]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');

      const menuButton = page.locator(
        'summary[aria-label="Öppna eller stäng meny"]',
      );
      await expect(menuButton).toBeVisible();
      const buttonBox = await menuButton.boundingBox();
      expect(buttonBox).not.toBeNull();
      expect(buttonBox?.x).toBeGreaterThanOrEqual(0);
      expect((buttonBox?.x ?? 0) + (buttonBox?.width ?? 0)).toBeLessThanOrEqual(
        width,
      );

      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    }

    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('link', { name: 'Hoppa till innehållet' }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('navigation', { name: 'Mobilmeny' }),
    ).toBeVisible();

    await expect(
      page
        .getByRole('navigation', { name: 'Mobilmeny' })
        .getByRole('link', { name: 'Start' }),
    ).toHaveAttribute('aria-current', 'page');

    const panelBox = await page.locator('.mobile-nav-panel').boundingBox();
    expect(panelBox).not.toBeNull();
    expect(panelBox?.x).toBeGreaterThanOrEqual(0);
    expect((panelBox?.x ?? 0) + (panelBox?.width ?? 0)).toBeLessThanOrEqual(
      320,
    );
  });
});

test.describe('vehicle lookup hero', () => {
  test.beforeEach(async ({ page }) => {
    await mockToken(page);
  });

  test('renders a cached result, suggestions and a prefilled booking link', async ({
    page,
  }) => {
    const response = vehicleLookupResponseSchema.parse({
      registrationNumber: 'ABC123',
      source: 'CACHE',
      unavailableReason: null,
      fetchedAt: '2026-09-08T08:00:00.000Z',
      data: {
        registrationNumber: 'ABC123',
        make: 'Volvo',
        model: 'V60',
        variant: 'B4',
        modelYear: 2022,
        vin: null,
        engineCode: null,
        fuelType: 'Bensin',
        firstRegistrationDate: '2022-02-01',
        lastInspectionDate: '2025-03-10',
        nextInspectionDueDate: '2027-03-31',
      },
      suggestedServices: [
        {
          serviceType: 'BRAKE_FLUID',
          severity: 'DUE_SOON',
          explanation: 'Bromsvätskan närmar sig rekommenderat bytesintervall.',
          sourceNote: 'Volvo serviceschema 2022',
        },
      ],
    });
    await page.route('**/api/public/vehicle-lookup', async (route) => {
      const rawBody = route.request().postData();
      const requestBody: unknown =
        rawBody === null ? null : JSON.parse(rawBody);
      expect(vehicleLookupInputSchema.parse(requestBody)).toEqual({
        registrationNumber: 'ABC 123',
        formToken: 'fixture-token',
      });
      await fulfilJson(route, response);
    });

    await page.goto('/');
    await submitLookup(page);

    await expect(
      page.getByRole('heading', { name: 'Volvo V60' }),
    ).toBeVisible();
    await expect(page.getByText('Bromsvätska', { exact: true })).toBeVisible();
    await expect(page.getByText('Snart dags')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Boka tid för ABC 123' }),
    ).toHaveAttribute('href', '/boka?regnr=ABC123');
  });

  test('daily ceiling fallback stays honest and keeps booking reachable', async ({
    page,
  }) => {
    const response = vehicleLookupResponseSchema.parse({
      registrationNumber: 'ABC123',
      data: null,
      source: 'UNAVAILABLE',
      unavailableReason: 'PUBLIC_LIMIT_REACHED',
      fetchedAt: null,
      suggestedServices: [],
    });
    await page.route('**/api/public/vehicle-lookup', async (route) => {
      await fulfilJson(route, response);
    });

    await page.goto('/');
    await submitLookup(page);
    await expect(
      page.getByText('Dagens fria bilsökningar är slut'),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Boka ändå' })).toHaveAttribute(
      'href',
      '/boka?regnr=ABC123',
    );
  });

  test('provider failure offers the plain booking path', async ({ page }) => {
    const response = vehicleLookupResponseSchema.parse({
      registrationNumber: 'ABC123',
      data: null,
      source: 'UNAVAILABLE',
      unavailableReason: 'PROVIDER_UNAVAILABLE',
      fetchedAt: null,
      suggestedServices: [],
    });
    await page.route('**/api/public/vehicle-lookup', async (route) => {
      await fulfilJson(route, response);
    });

    await page.goto('/');
    await submitLookup(page);
    await expect(
      page.getByText('Biluppgifterna är tillfälligt otillgängliga'),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Boka ändå' })).toBeVisible();
  });

  test('hourly rate limits and unknown registrations have useful fallbacks', async ({
    page,
  }) => {
    await page.route('**/api/public/vehicle-lookup', async (route) => {
      await fulfilJson(
        route,
        {
          error: {
            code: 'RATE_LIMITED',
            message: 'För många försök.',
            requestId: 'fixture-request',
          },
        },
        429,
      );
    });

    await page.goto('/');
    await submitLookup(page);
    await expect(
      page.getByText('Du har gjort flera sökningar på kort tid.'),
    ).toBeVisible();

    await page.unroute('**/api/public/vehicle-lookup');
    const unknown = vehicleLookupResponseSchema.parse({
      registrationNumber: 'XYZ987',
      data: null,
      source: 'PROVIDER',
      unavailableReason: null,
      fetchedAt: '2026-09-09T08:00:00.000Z',
      suggestedServices: [],
    });
    await page.route('**/api/public/vehicle-lookup', async (route) => {
      await fulfilJson(route, unknown);
    });
    await submitLookup(page, 'XYZ 987');
    await expect(page.getByText('Vi hittade ingen bil')).toBeVisible();
  });
});
