import { expect, test } from '@playwright/test';

test.describe('public routes', () => {
  const routes = [
    ['/', 'Din bil. Vårt hantverk.'],
    ['/tjanster', 'Allt bilen behöver. Inget den inte behöver.'],
    ['/tjanster/bilservice', 'Bilservice'],
    ['/om-oss', 'Ett löfte: vi står för jobbet.'],
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

  test('uses the current workshop identity and direct WhatsApp links', async ({
    page,
  }) => {
    await page.goto('/kontakt');

    await expect(
      page.getByRole('link', { name: 'M&R AUTOMOTIVE, startsida' }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: '+46 765 79 54 90', exact: true }).first(),
    ).toHaveAttribute('href', 'tel:+46765795490');
    await expect(
      page.getByRole('link', { name: '+46 737 01 84 04', exact: true }).first(),
    ).toHaveAttribute('href', 'tel:+46737018404');

    const primaryWhatsApp = page.getByRole('link', {
      name: 'Skriv till oss på WhatsApp, +46 765 79 54 90',
    });
    const whatsappUrl = new URL(
      (await primaryWhatsApp.getAttribute('href')) ?? '',
    );
    expect(whatsappUrl.origin).toBe('https://wa.me');
    expect(whatsappUrl.pathname).toBe('/46765795490');
    expect(whatsappUrl.searchParams.get('text')).toBe(
      'Hej! Jag har en fråga gällande service och reparation av bil.',
    );
  });

  test('brand and WhatsApp action stay inside phone, tablet and desktop views', async ({
    page,
  }) => {
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');

      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);

      for (const locator of [
        page.getByRole('link', { name: 'M&R AUTOMOTIVE, startsida' }).first(),
        page.getByRole('link', {
          name: 'Skriv till oss på WhatsApp, +46 765 79 54 90',
        }),
      ]) {
        const box = await locator.boundingBox();
        expect(box).not.toBeNull();
        expect(box?.x).toBeGreaterThanOrEqual(0);
        expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
      }
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

  test('the mobile menu closes itself once the new page is on screen', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const panel = page.locator('.mobile-nav-panel');
    const openMenu = async () => {
      await page
        .locator('summary[aria-label="Öppna eller stäng meny"]')
        .click();
      await expect(panel).toBeVisible();
    };

    // Next navigates on the client, so nothing re-mounts the header: an
    // uncontrolled `<details>` stayed open and covered the page it had just
    // been asked to show.
    await openMenu();
    await page
      .getByRole('navigation', { name: 'Mobilmeny' })
      .getByRole('link', { name: 'Tjänster' })
      .click();
    await expect(page).toHaveURL(/\/tjanster$/);
    await expect(panel).toBeHidden();

    // And on the way back, where no click of ours closes anything.
    await openMenu();
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(panel).toBeHidden();

    // The dimmed page behind the panel is a way out too.
    await openMenu();
    await page
      .locator('.mobile-nav-backdrop')
      .click({ position: { x: 10, y: 400 } });
    await expect(panel).toBeHidden();
  });
});
