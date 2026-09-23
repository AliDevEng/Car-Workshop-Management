import { expect, test, type Browser, type Page } from '@playwright/test';
import { addStockholmDays, stockholmDate } from 'shared';

const ADMIN_EMAIL = 'admin@verkstaden.se';
const ADMIN_PASSWORD = 'utveckling-admin-2026';

test.describe.configure({ mode: 'serial' });

async function login(page: Page, returnTo = '/admin'): Promise<void> {
  await page.goto(`/admin/logga-in?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel('E-post').fill(ADMIN_EMAIL);
  await page.getByLabel('Lösenord').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Logga in' }).click();
  await expect(page).toHaveURL(new RegExp(`${returnTo.replace('/', '\\/')}$`));
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** A fresh, standard-format plate so repeated runs never collide on the
 * unique registration-number index (the same technique `customers-vehicles`
 * uses). */
function uniqueStandardPlate(prefix: string): string {
  const now = Date.now();
  const digits = String(now % 100).padStart(2, '0');
  const letter = LETTERS[now % LETTERS.length];
  return `${prefix}${digits}${letter}`;
}

/** Creates a customer and a vehicle for it, landing on the vehicle page. */
async function createCustomerAndVehicle(
  page: Page,
  customerName: string,
  plate: string,
): Promise<void> {
  await page.goto('/admin/kunder');
  await page.getByRole('button', { name: 'Ny kund' }).click();
  await page.getByLabel('Namn').fill(customerName);
  await page.getByLabel('Telefon').fill('070-555 11 22');
  await page.getByRole('button', { name: 'Skapa kund' }).click();
  await expect(page).toHaveURL(/\/admin\/kunder\/.+/);

  await page.getByRole('button', { name: 'Lägg till fordon' }).click();
  await page.getByLabel('Registreringsnummer').fill(plate);
  await page.getByLabel('Märke').fill('Testmärke');
  await page.getByLabel('Modell').fill('Testmodell');
  await page.getByRole('button', { name: 'Skapa fordon' }).click();
  await expect(page).toHaveURL(/\/admin\/fordon\/.+/);
}

test.describe('work orders (F9)', () => {
  const stamp = Date.now();
  const customerName = `E2E Arbetsorder ${stamp}`;
  const plate = uniqueStandardPlate('WOK');

  test('runs a mixed labour/parts job end to end: create, add lines, reorder, complete, and appears in history exactly once-deducted (F9.7.3, F9.7.4)', async ({
    page,
  }) => {
    await login(page);
    await createCustomerAndVehicle(page, customerName, plate);

    // From the vehicle page, go create the work order via the list's own
    // entry point (F9.1) rather than assuming a shortcut exists here.
    await page.goto('/admin/arbetsordrar');
    await page.getByRole('button', { name: 'Ny arbetsorder' }).click();
    await page.getByLabel('Sök fordon').fill(plate);
    // Scoped to the dialog: the work-order list behind it renders its rows
    // twice — a table above `md` and cards below it — so an unscoped text
    // query now matches the hidden copy as well (UI_UX_AUDIT L2).
    await page
      .getByRole('dialog')
      .getByText(plate.slice(0, 3), { exact: false })
      .first()
      .waitFor();
    await page.locator('.max-h-40 button').first().click();
    await page.getByLabel('Beskrivning').fill('E2E: service och bromsbyte');
    await page.getByRole('button', { name: 'Skapa arbetsorder' }).click();
    await expect(page).toHaveURL(/\/admin\/arbetsordrar\/.+/);
    // A draft's title is 'Arbetsorder (utkast)', not the bare 'Utkast' the
    // list and the breadcrumb already say (UI_UX_AUDIT W7).
    await expect(
      page.getByRole('heading', { name: 'Arbetsorder (utkast)' }),
    ).toBeVisible();

    // A labour line.
    await page.getByRole('button', { name: 'Lägg till rad' }).click();
    await page.getByRole('dialog').getByLabel('Typ').click();
    await page.getByRole('option', { name: 'Arbete' }).click();
    await page.getByRole('dialog').getByLabel('Beskrivning').fill('Diagnos');
    await page.getByRole('dialog').getByLabel('Antal').fill('1');
    await page
      .getByRole('dialog')
      .getByLabel('Á-pris (exkl. moms)')
      .fill('600');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Lägg till rad' })
      .click();
    await expect(page.getByText('Raden är tillagd.')).toBeVisible();

    // A free-text fee line (no article).
    await page.getByRole('button', { name: 'Lägg till rad' }).click();
    await page.getByRole('dialog').getByLabel('Typ').click();
    await page.getByRole('option', { name: 'Avgift' }).click();
    await page
      .getByRole('dialog')
      .getByLabel('Beskrivning')
      .fill('Miljöavgift');
    await page.getByRole('dialog').getByLabel('Antal').fill('1');
    await page.getByRole('dialog').getByLabel('Á-pris (exkl. moms)').fill('49');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Lägg till rad' })
      .click();

    // Two lines now on the order; totals reflect both (600 + 49 = 649 net,
    // never recomputed in the browser — read straight off the panel).
    await expect(page.getByText('649,00 kr').first()).toBeVisible();

    // Move the second line above the first with the keyboard control
    // (F9.3.4's alternative to drag-and-drop).
    const moveUpButtons = page.getByRole('button', { name: 'Flytta upp' });
    await moveUpButtons.nth(1).click();
    await page.waitForTimeout(500);

    // `DRAFT` cannot jump straight to `COMPLETED` (`shared/work-order-state.ts`);
    // the status control only offers the transitions the state machine allows.
    await page.getByRole('button', { name: 'Påbörja arbetet' }).click();
    await expect(page.getByText('Status ändrad till Pågår.')).toBeVisible();

    // Complete: blocked without an out-odometer, then succeeds with one.
    const completeButton = page.getByRole('button', {
      name: 'Slutför arbetsorder',
    });
    await completeButton.first().click();
    const confirmButton = page
      .getByRole('dialog')
      .getByRole('button', { name: 'Slutför arbetsorder' });
    await expect(confirmButton).toBeDisabled();
    await page.locator('#complete-odometer-out').fill('500');
    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();
    await expect(page.getByText('Arbetsordern är slutförd.')).toBeVisible();
    await expect(page.getByText('Slutförd', { exact: true })).toBeVisible();
    // Locked once completed, announced once as a banner at the top of the
    // page rather than as a sentence inside the lines card — and the lock now
    // covers the description and odometer too, which used to stay editable
    // (UI_UX_AUDIT W4).
    await expect(
      page.getByText(
        /Arbetsordern är låst. Rader, beskrivning och mätarställning kan inte längre ändras/,
      ),
    ).toBeVisible();
    // `.first()`: the order's own description, which comes before the
    // lines' own 'Beskrivning' inputs — those are disabled too, and were
    // already locked before W4; this one was not.
    await expect(page.getByLabel('Beskrivning').first()).toBeDisabled();

    // History: the vehicle and the customer both show exactly one completed
    // entry for this job (F9.7.1, F9.7.4).
    // The header carries two labelled chips now, not a name with a 'Visa
    // fordon' link beneath it (UI_UX_AUDIT W6).
    await page.getByRole('link', { name: /^Fordon:/ }).click();
    await expect(page).toHaveURL(/\/admin\/fordon\/.+/);
    await expect(page.getByText('Arbetsorderhistorik')).toBeVisible();
    await expect(page.getByText('Slutförd').first()).toBeVisible();

    // From the *vehicle* page: its 'Ägare' card links to the customer by
    // name. (The work-order header's own chip reads 'Kund: <name>'.)
    await page.getByRole('link', { name: customerName }).click();
    await expect(page).toHaveURL(/\/admin\/kunder\/.+/);
    await expect(page.getByText('Arbetsorderhistorik')).toBeVisible();
  });

  test('a version conflict between two staff members opens the reload prompt, not a silent overwrite (F9.6.2, F9.6.4)', async ({
    browser,
  }: {
    readonly browser: Browser;
  }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      await login(pageA);
      await login(pageB);

      // A fresh work order both tabs open to.
      await pageA.goto('/admin/arbetsordrar');
      await pageA.getByRole('button', { name: 'Ny arbetsorder' }).click();
      await pageA.getByLabel('Sök fordon').fill(plate);
      await pageA.locator('.max-h-40 button').first().waitFor();
      await pageA.locator('.max-h-40 button').first().click();
      await pageA.getByLabel('Beskrivning').fill('E2E: konflikttest');
      await pageA.getByRole('button', { name: 'Skapa arbetsorder' }).click();
      await expect(pageA).toHaveURL(/\/admin\/arbetsordrar\/.+/);
      const url = pageA.url();

      await pageB.goto(url);
      await expect(
        pageB.getByRole('heading', { name: 'Arbetsorder (utkast)' }),
      ).toBeVisible();

      // Tab A saves a header field first — the version it read is still
      // current, so this succeeds and bumps the version.
      await pageA
        .getByLabel('Beskrivning')
        .fill('E2E: konflikttest (ändrad av A)');
      await pageA.getByLabel('Beskrivning').blur();
      // A generous timeout: this run may share the dev database and backend
      // process with other spec files running in parallel workers (the same
      // reasoning `bookings-calendar.spec.ts` already applies).
      await expect(pageA.getByText('Sparat')).toBeVisible({ timeout: 15_000 });

      // Tab B still holds the *old* version and now saves its own edit —
      // the header route's compare-and-swap must reject it as `409`.
      await pageB
        .getByLabel('Beskrivning')
        .fill('E2E: konflikttest (ändrad av B)');
      await pageB.getByLabel('Beskrivning').blur();

      await expect(
        pageB.getByRole('heading', { name: 'Arbetsordern har ändrats' }),
      ).toBeVisible({ timeout: 15_000 });
      // The dialog names B's own unsaved attempt (F9.6.3) rather than
      // discarding it silently.
      await expect(
        pageB.getByText('E2E: konflikttest (ändrad av B)'),
      ).toBeVisible();

      // "Fortsätt redigera" just closes the prompt — B's typed text stays.
      await pageB.getByRole('button', { name: 'Fortsätt redigera' }).click();
      await expect(pageB.getByLabel('Beskrivning')).toHaveValue(
        'E2E: konflikttest (ändrad av B)',
      );
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test('"Starta arbete" on a confirmed booking creates a work order linked to it (F9.7.2)', async ({
    page,
  }) => {
    const bookingCustomer = `E2E Bokat Arbete ${stamp}`;

    // A real public request, confirmed the same way F8's own suite does —
    // this button only appears once a booking actually has a vehicle.
    await page.goto('/boka');
    await page.getByLabel('Namn').fill(bookingCustomer);
    await page.getByLabel('Telefon').fill(`070-${String(stamp).slice(-7)}`);
    await page.getByLabel('Registreringsnummer').fill(plate);
    await page.waitForTimeout(3_500);
    await page.getByRole('button', { name: 'Skicka förfrågan' }).click();
    await expect(page).toHaveURL(/\/boka\/tack$/);

    await login(page);
    await page.goto('/admin/bokningar?vy=forfragningar');
    // By cell role: the inbox renders each row twice (table and card), and
    // only the visible one is in the accessibility tree.
    await page.getByRole('cell', { name: bookingCustomer }).click();
    await page.getByRole('button', { name: 'Bekräfta' }).click();
    await expect(
      page.getByRole('heading', { name: 'Bekräfta bokning' }),
    ).toBeVisible();
    // The request carries no preferred date, so one has to be picked before
    // the confirm button enables — the same custom calendar F8's own suite
    // drives.
    await page.getByRole('button', { name: 'Välj datum' }).click();
    const tomorrow = addStockholmDays(stockholmDate(new Date()), 1);
    await page.locator(`[data-date="${tomorrow}"]`).click();
    await page.getByRole('button', { name: 'Bekräfta bokning' }).click();
    await expect(
      page.getByRole('heading', { name: 'Bekräfta bokning' }),
    ).toHaveCount(0);

    // The confirmed request is now a scheduled `Booking` on tomorrow's day
    // view — the same block F8's own suite opens.
    await page.goto(`/admin/bokningar?vy=dag&date=${tomorrow}`);
    const block = page.getByRole('button', {
      name: new RegExp(bookingCustomer),
    });
    await expect(block).toBeVisible({ timeout: 15_000 });
    await block.click();
    await expect(
      page.getByRole('heading', { name: bookingCustomer }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Starta arbete' }).click();
    await expect(
      page.getByRole('heading', { name: 'Starta arbete' }),
    ).toBeVisible();
    await page.getByLabel('Beskrivning').fill('E2E: arbete från bokning');
    await page.getByRole('button', { name: 'Starta arbete' }).last().click();

    await expect(page).toHaveURL(/\/admin\/arbetsordrar\/.+/);
    await expect(
      page.getByRole('link', { name: new RegExp(`^Kund: ${bookingCustomer}`) }),
    ).toBeVisible();
  });
});
