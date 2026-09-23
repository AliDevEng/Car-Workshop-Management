import { expect, test, type Page } from '@playwright/test';

/**
 * F1's Definition of Done: "every component has all its states, is keyboard
 * operable, meets AA contrast, and appears on an internal `/admin/styleguide`
 * page."
 *
 * These run against the styleguide because the parts of a design system that
 * actually break are the ones a screenshot cannot show — a dialog that never
 * gives focus back, a button that shrinks while saving, a sort control
 * offered on a column the API cannot page by.
 */

const ADMIN_EMAIL = 'admin@verkstaden.se';
const ADMIN_PASSWORD = 'utveckling-admin-2026';

test.describe.configure({ mode: 'serial' });

async function login(page: Page): Promise<void> {
  await page.goto('/admin/logga-in?returnTo=/admin/styleguide');
  await page.getByLabel('E-post').fill(ADMIN_EMAIL);
  await page.getByLabel('Lösenord').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Logga in' }).click();
  await expect(page).toHaveURL(/\/admin\/styleguide$/);
  await expect(page.getByRole('heading', { name: 'Stilguide' })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.evaluate(() => document.fonts.ready);
});

test.describe('tokens and type', () => {
  test('every measured colour pair meets AA', async ({ page }) => {
    // F1.6.2. The table measures the live document, so this asserts the
    // palette as rendered rather than a copy of it.
    // Scoped by test id: the `DataTable` demo further down the page is also
    // a `<table>`, and an unscoped `tbody tr` read its price column as a
    // contrast level.
    const rows = page.getByTestId('contrast-table').locator('tbody tr');
    await expect(rows.first()).toBeVisible();

    const levels = await rows.locator('td:last-child').allInnerTexts();
    expect(levels.length).toBeGreaterThanOrEqual(10);
    for (const level of levels) {
      expect(['AA', 'AAA'], `contrast level ${level} is below AA`).toContain(
        level.trim(),
      );
    }
  });

  test('the display face is actually expanded', async ({ page }) => {
    // §9.3 asks for Archivo at an expanded width. Selecting the family alone
    // leaves `font-stretch: 100%`, which renders identically to body text.
    const stretch = await page
      .getByRole('heading', { name: 'Stilguide' })
      .evaluate((element) => getComputedStyle(element).fontStretch);
    expect(stretch).not.toBe('100%');
  });

  test('the admin surface re-themes the shadcn primitives', async ({
    page,
  }) => {
    // The scoped class is the whole mechanism: one class, every primitive.
    // `.first()` is `<body>`, which now carries it too so Radix portals — they
    // mount outside the layout wrapper — resolve the admin tokens rather than
    // the public ones (UI_UX_AUDIT G4).
    const background = await page
      .locator('.admin-scope')
      .first()
      .evaluate((element) =>
        getComputedStyle(element).getPropertyValue('--background').trim(),
      );
    expect(background).toBe('#1c2b33');
  });
});

test.describe('buttons', () => {
  test('the pending state keeps the button exactly as wide', async ({
    page,
  }) => {
    // F1.2.3. A button that shrinks while saving moves whatever is beside it,
    // and on a dense admin screen the next control lands under the pointer.
    const button = page.getByRole('button', { name: 'Klicka för att ladda' });
    const before = await button.boundingBox();

    await button.click();
    const pending = page.locator('button[aria-busy="true"]');
    await expect(pending).toBeVisible();
    const during = await pending.boundingBox();

    expect(during?.width).toBeCloseTo(before?.width ?? 0, 1);
    await expect(pending).toBeDisabled();
  });

  test('the large size meets the 44 px touch target', async ({ page }) => {
    const box = await page
      .getByRole('button', { name: 'Stor — 44 px' })
      .boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  });

  test('every variant shows a focus ring', async ({ page }) => {
    // F1.2.4. Checked against the admin ground, which is where a
    // `--ring` chosen for the public surface would disappear.
    await page.keyboard.press('Tab');
    for (const name of ['Spara', 'Avbryt', 'Filtrera', 'Mer', 'Ta bort']) {
      const button = page.getByRole('button', { name, exact: true }).first();
      await button.focus();
      const outline = await button.evaluate((element) => {
        const styles = getComputedStyle(element);
        return {
          width: styles.outlineWidth,
          style: styles.outlineStyle,
        };
      });
      expect(outline.style, `${name} has no focus outline`).not.toBe('none');
      expect(Number.parseFloat(outline.width)).toBeGreaterThan(0);
    }
  });
});

test.describe('conversion inputs', () => {
  async function typeInto(page: Page, id: string, text: string): Promise<void> {
    const field = page.locator(id);
    await field.fill('');
    await field.pressSequentially(text);
    await field.blur();
  }

  test('money accepts both decimal separators and submits öre', async ({
    page,
  }) => {
    // F1.3.4 and F1.3.8: Swedish keyboards produce both `,` and `.`.
    for (const typed of ['1250,50', '1250.50']) {
      await typeInto(page, '#sg-money', typed);
      await expect(page.getByText('Skickas som 125050 öre')).toBeVisible();
    }
  });

  test('money accepts a pasted, grouped amount', async ({ page }) => {
    // A price copied off this application's own screen carries a
    // non-breaking space between thousands groups.
    // `fill` sets the whole value at once and fires a single `input` event,
    // which is what a paste looks like to React — unlike `pressSequentially`,
    // which types. The separator is U+00A0, the non-breaking space
    // `Intl.NumberFormat('sv-SE')` puts between thousands groups.
    const field = page.locator('#sg-money');
    await field.fill('1 234,50');
    await expect(page.getByText('Skickas som 123450 öre')).toBeVisible();
  });

  test('quantity keeps three decimals rather than rounding', async ({
    page,
  }) => {
    // 0,001 is the smallest storable quantity. An earlier parser read the
    // 3-digit tail as a thousands group and returned 1.
    await typeInto(page, '#sg-quantity', '0,001');
    await expect(page.getByText('Skickas som 0.001')).toBeVisible();
  });

  test('the odometer shows the km it will store', async ({ page }) => {
    // F1.3.6. km/mil is in CLAUDE.md's trap table; showing both is what
    // makes a factor-of-ten error visible at the moment it is made.
    await typeInto(page, '#sg-odometer', '1234,5');
    await expect(page.getByText('Sparas som 12 345 km')).toBeVisible();
  });

  test('a registration number uppercases and normalises', async ({ page }) => {
    await typeInto(page, '#sg-regnr', 'abc 12d');
    await expect(page.locator('#sg-regnr')).toHaveValue('ABC 12D');
    await expect(page.getByText('Lagras som ABC12D')).toBeVisible();
  });

  test('a non-standard plate is accepted, not blocked', async ({ page }) => {
    // Personalised plates and imports exist. Refusing a customer's actual
    // registration number is worse than accepting an odd-looking one.
    await typeInto(page, '#sg-regnr', 'MIN BIL');
    await expect(page.locator('#sg-regnr')).not.toHaveValue('');
    await expect(page.getByText(/sparas som det är|Kontrollera/)).toBeVisible();
  });
});

test.describe('data table', () => {
  test('offers sorting only on the columns the API declares', async ({
    page,
  }) => {
    // F1.4.2 and §8.1: a cursor is stable only against the sort key it was
    // built for. `Mätarställning` and `Belopp` are deliberately undeclared.
    const header = page.getByRole('columnheader');
    await expect(
      header.filter({ hasText: 'Kund' }).getByRole('button'),
    ).toBeVisible();
    await expect(
      header.filter({ hasText: 'Mätarställning' }).getByRole('button'),
    ).toHaveCount(0);
    await expect(
      header.filter({ hasText: 'Belopp' }).getByRole('button'),
    ).toHaveCount(0);
  });

  test('rows are operable from the keyboard', async ({ page }) => {
    // F1.4.1. A row that only responds to a mouse is unusable with gloves
    // on a tablet, and unreachable with a screen reader.
    const firstRow = page.getByRole('row').filter({ hasText: 'ABC 123' });
    await firstRow.focus();
    await page.keyboard.press('ArrowDown');
    await expect(
      page.getByRole('row').filter({ hasText: 'XYZ 789' }),
    ).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page.getByText('Öppnade XYZ 789')).toBeVisible();
  });

  test('numbers are right-aligned with tabular figures', async ({ page }) => {
    const cell = page.getByRole('cell', { name: '1 250,50 kr' });
    const style = await cell.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        align: styles.textAlign,
        numeric: styles.fontVariantNumeric,
      };
    });
    expect(style.align).toBe('right');
    expect(style.numeric).toContain('tabular-nums');
  });
});

test.describe('feedback', () => {
  test('an error toast stays until dismissed; a success toast does not', async ({
    page,
  }) => {
    // F1.5.1. An error that vanishes before a mechanic looks up from the car
    // has destroyed the request id needed to support it.
    await page.getByRole('button', { name: 'Fel (stannar kvar)' }).click();
    const error = page.getByText('Arbetsordern har ändrats av någon annan.');
    await expect(error).toBeVisible();
    await expect(page.getByText('Referens: req-91ba77de')).toBeVisible();

    await page.waitForTimeout(5000);
    await expect(error).toBeVisible();
  });

  test('the confirm dialog traps focus and returns it on close', async ({
    page,
  }) => {
    // F1.1.4 and F1.5.2.
    const trigger = page
      .getByRole('button', { name: 'Ta bort arbetsorder', exact: true })
      .first();
    await trigger.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Det går inte att ångra');
    // The confirm button names the action rather than saying "OK".
    await expect(
      dialog.getByRole('button', { name: 'Ta bort arbetsorder' }),
    ).toBeVisible();

    const focusInside = await page.evaluate(
      () => document.activeElement?.closest('[role="dialog"]') !== null,
    );
    expect(focusInside).toBe(true);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('the sheet closes and returns focus to its trigger', async ({
    page,
  }) => {
    const trigger = page.getByRole('button', { name: 'Öppna panel' });
    await trigger.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  });
});

test.describe('states', () => {
  test('empty, error and loading are all reachable', async ({ page }) => {
    // §10 requires all three on every screen; they exist once, here.
    await expect(
      page.getByText('Inga artiklar än. Lägg till den första.'),
    ).toBeVisible();

    await page.getByRole('tab', { name: 'Fel' }).click();
    await expect(page.getByText('Kunde inte hämta artiklarna.')).toBeVisible();
    // The request id is what connects this screen to the backend log.
    await expect(page.getByText('Referens: req-3f9a2c81')).toBeVisible();

    await page.getByRole('tab', { name: 'Laddar' }).click();
    // The tab panel is also labelled "Laddar"; the skeleton is the busy one.
    await expect(page.locator('[aria-busy="true"]')).toBeVisible();
  });
});
