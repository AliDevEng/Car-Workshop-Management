import { expect, test, type Page } from '@playwright/test';
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

/**
 * Unique per run, for the same reason `bookings-calendar.spec.ts` gives: the
 * backend matches a returning caller on their telephone number (§8.2), so a
 * fixed number would attach every run's booking to the customer the first run
 * created — and the calendar block would then carry a previous run's name.
 */
function uniquePhone(seed: number): string {
  return `070-${String(seed).slice(-7)}`;
}

const PLATE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * A unique, valid Swedish plate (`ABC12D`) derived from the run's timestamp.
 *
 * Three letters, not a fixed `XYZ` prefix with two varying digits. The first
 * version of this helper had only a hundred possible values, and a collision
 * with an earlier run is not a flake but a *wrong* test: the backend correctly
 * reuses a plate it already knows, and correctly refuses to reassign a car
 * that already has an owner (§6.3) — so a colliding run silently checked the
 * previous run's customer instead of this one's.
 */
function uniquePlate(seed: number): string {
  const letters = seed % (26 * 26 * 26);
  const prefix =
    PLATE_LETTERS.charAt(Math.floor(letters / 676) % 26) +
    PLATE_LETTERS.charAt(Math.floor(letters / 26) % 26) +
    PLATE_LETTERS.charAt(letters % 26);
  const digits = String(Math.floor(seed / 17_576) % 100).padStart(2, '0');
  return `${prefix}${digits}A`;
}

/**
 * A booking taken over the telephone — the commonest case in this workshop,
 * and the one that had no screen at all until now.
 *
 * Driven end to end against the real backend rather than a mocked route: the
 * point of the feature is that customer, vehicle and booking are written in
 * one transaction, and a mock would assert the shape of a request instead of
 * the thing that actually has to work.
 */
test.describe('taking a booking over the telephone', () => {
  const stamp = Date.now();
  const caller = `E2E Telefonkund ${stamp}`;
  const tomorrow = addStockholmDays(stockholmDate(new Date()), 1);

  test('creates a customer, a vehicle and a calendar booking in one dialog', async ({
    page,
  }) => {
    await login(page);
    await page.goto(`/admin/bokningar?vy=dag&date=${tomorrow}`);

    await page.getByRole('button', { name: 'Ny bokning' }).click();
    await expect(
      page.getByRole('heading', { name: 'Ny bokning' }),
    ).toBeVisible();

    // The dialog opens on the day the calendar was showing, so the commonest
    // case — "kan du imorgon?" — needs no date picking at all.
    await page.getByLabel('Starttid').fill('09:00');

    await page.getByLabel('Namn').fill(caller);
    await page.getByLabel('Telefon').fill(uniquePhone(stamp));

    // The vehicle: a plate, then two clicks through the catalogue rather than
    // typing "Volkswagen" and hoping it is spelled the same as last time.
    await page.getByLabel('Registreringsnummer').fill(uniquePlate(stamp));

    await page.getByRole('combobox', { name: 'Märke' }).click();
    await page.getByRole('option', { name: 'Volvo', exact: true }).click();
    await page.getByRole('combobox', { name: 'Modell' }).click();
    await page.getByRole('option', { name: 'V70', exact: true }).click();

    await page.getByRole('button', { name: 'Skapa bokning' }).click();

    await expect(page.getByText(/Bokningen är skapad/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ny bokning' })).toHaveCount(
      0,
    );

    // On the calendar, on the right day.
    await expect(
      page.getByRole('button', { name: new RegExp(caller) }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('the caller is now a real customer with the car attached', async ({
    page,
  }) => {
    await login(page);
    await page.goto(`/admin/kunder?q=${encodeURIComponent(caller)}`);

    await page.getByRole('cell', { name: caller }).click();
    await expect(page.getByRole('heading', { name: caller })).toBeVisible();
    // The make and model chosen from the catalogue reached the vehicle
    // record, rather than being discarded into a placeholder.
    await expect(page.getByText('Volvo V70').first()).toBeVisible();
  });

  test('“Övrigt” accepts a car the catalogue has never heard of, and stores it', async ({
    page,
  }) => {
    const oddCustomer = `E2E Ovanlig bil ${stamp}`;
    await login(page);
    await page.goto(`/admin/bokningar?vy=dag&date=${tomorrow}`);

    await page.getByRole('button', { name: 'Ny bokning' }).click();
    await page.getByLabel('Starttid').fill('14:00');
    await page.getByLabel('Namn').fill(oddCustomer);
    await page.getByLabel('Telefon').fill(uniquePhone(stamp + 1));
    await page.getByLabel('Registreringsnummer').fill(uniquePlate(stamp + 1));

    await page.getByRole('combobox', { name: 'Märke' }).click();
    await page.getByRole('option', { name: 'Övrigt — skriv själv' }).click();

    // Both fields become free text: a 1987 Saab must not be harder to book
    // than a new Golf. Choosing "Övrigt" for the *make* is enough — the model
    // dropdown never renders, because the catalogue has no models to offer
    // for a make it does not know.
    await page.getByLabel('Märke, eget').fill('Saab');
    await page.getByLabel('Modell, egen').fill('9000 Turbo');

    await page.getByRole('button', { name: 'Skapa bokning' }).click();
    await expect(page.getByText(/Bokningen är skapad/)).toBeVisible();

    /*
     * Assert what was **stored**, not merely that the toast appeared. The
     * first version of this test stopped at the toast, and passed for three
     * runs while the free-text model was being silently dropped — every Saab
     * went into the register as "Saab / Okänd modell". A success message is
     * not evidence that the right thing was saved.
     */
    await page.goto(`/admin/kunder?q=${encodeURIComponent(oddCustomer)}`);
    await page.getByRole('cell', { name: oddCustomer }).click();
    await expect(page.getByText('Saab 9000 Turbo').first()).toBeVisible();
  });

  test('a booking needs a time, a name and a number — and nothing else', async ({
    page,
  }) => {
    await login(page);
    await page.goto(`/admin/bokningar?vy=dag&date=${tomorrow}`);

    await page.getByRole('button', { name: 'Ny bokning' }).click();
    const submit = page.getByRole('button', { name: 'Skapa bokning' });

    // Nothing typed: the customer is what is missing, because
    // `Booking.customerId` is NOT NULL — the calendar is a promise to a
    // person (§4.2).
    await expect(submit).toBeDisabled();

    await page.getByLabel('Starttid').fill('16:00');
    await page.getByLabel('Namn').fill(`E2E Utan bil ${stamp}`);
    await page.getByLabel('Telefon').fill(uniquePhone(stamp + 2));

    // No car at all, which is a real call: the customer has not read the
    // plate off their key ring yet.
    await page.getByRole('tab', { name: 'Inget' }).click();
    await expect(submit).toBeEnabled();

    await submit.click();
    await expect(page.getByText(/Bokningen är skapad/)).toBeVisible();
  });
});
