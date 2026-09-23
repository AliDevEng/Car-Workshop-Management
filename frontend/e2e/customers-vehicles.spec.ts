import { expect, test, type Page } from '@playwright/test';

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

/**
 * A fresh, standard-format plate (`ABC12D`) so repeated test runs never
 * collide on the unique registration-number index, and the display form is
 * predictably the spaced 6-character one (`shared/regnr.ts`).
 */
function uniqueStandardPlate(prefix: string): string {
  const now = Date.now();
  const digits = String(now % 100).padStart(2, '0');
  const letter = LETTERS[now % LETTERS.length];
  return `${prefix}${digits}${letter}`;
}

function spacedDisplay(plate: string): string {
  return `${plate.slice(0, 3)} ${plate.slice(3)}`;
}

test.describe('customers and vehicles (F6)', () => {
  test('creates a customer and a vehicle, then finds the vehicle by registration number in one search and one click (F6.6.1)', async ({
    page,
  }) => {
    await login(page);
    const customerName = `E2E Testperson ${Date.now()}`;
    const plate = uniqueStandardPlate('TST');
    const displayPlate = spacedDisplay(plate);

    await page.goto('/admin/kunder');
    await page.getByRole('button', { name: 'Ny kund' }).click();
    await page.getByLabel('Namn').fill(customerName);
    await page.getByLabel('Telefon').fill('070-000 11 22');
    await page.getByRole('button', { name: 'Skapa kund' }).click();

    await expect(page).toHaveURL(/\/admin\/kunder\/.+/);
    await expect(
      page.getByRole('heading', { name: customerName }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Lägg till fordon' }).click();
    await page.getByLabel('Registreringsnummer').fill(plate);
    await page.getByLabel('Märke').fill('Testmärke');
    await page.getByLabel('Modell').fill('Testmodell');
    await page.getByRole('button', { name: 'Skapa fordon' }).click();

    await expect(page).toHaveURL(/\/admin\/fordon\/.+/);
    await expect(
      page.getByRole('heading', { name: displayPlate }),
    ).toBeVisible();

    // One search, one click: the global search finds the new vehicle by plate.
    await page.goto('/admin');
    await page.keyboard.press('/');
    await page
      .getByPlaceholder('Sök på namn, telefon, regnr eller artikelnummer')
      .fill(plate);
    // The global search's results are buttons, not table rows. Scoped to the
    // dialog so the page behind it cannot match first.
    await page.getByRole('dialog').getByText(displayPlate).click();
    await expect(page).toHaveURL(/\/admin\/fordon\/.+/);
    await expect(
      page.getByRole('heading', { name: displayPlate }),
    ).toBeVisible();
    // `.first()`: the owner's name legitimately appears twice — the page
    // header (F6.4.1) and the "Ägare" card both show it.
    await expect(page.getByText(customerName).first()).toBeVisible();
  });

  test('reassigns a vehicle to another customer and keeps its odometer history (F6.6.2)', async ({
    page,
  }) => {
    await login(page);
    const stamp = Date.now();
    const originalOwner = `E2E Ägare Ett ${stamp}`;
    const newOwner = `E2E Ägare Två ${stamp}`;
    const plate = uniqueStandardPlate('REA');
    const displayPlate = spacedDisplay(plate);

    async function createCustomer(name: string): Promise<void> {
      await page.goto('/admin/kunder');
      await page.getByRole('button', { name: 'Ny kund' }).click();
      await page.getByLabel('Namn').fill(name);
      await page.getByLabel('Telefon').fill('08-11 22 33');
      await page.getByRole('button', { name: 'Skapa kund' }).click();
      await expect(page).toHaveURL(/\/admin\/kunder\/.+/);
    }

    await createCustomer(originalOwner);
    await page.getByRole('button', { name: 'Lägg till fordon' }).click();
    await page.getByLabel('Registreringsnummer').fill(plate);
    await page.getByLabel('Märke').fill('Volvo');
    await page.getByLabel('Modell').fill('V70');
    await page.getByRole('button', { name: 'Skapa fordon' }).click();
    await expect(page).toHaveURL(/\/admin\/fordon\/.+/);

    // Record an odometer reading before reassigning.
    await page.getByRole('button', { name: 'Ny avläsning' }).click();
    // `getByRole`, not `getByLabel`: the dialog's own title ("Ny
    // mätarställning") contains this field's label as a substring, which
    // makes a plain label lookup ambiguous.
    await page.getByRole('textbox', { name: 'Mätarställning' }).fill('1000');
    await page.getByRole('button', { name: 'Spara avläsning' }).click();
    // A regex, not a literal string: Swedish thousands grouping
    // (`Intl.NumberFormat('sv-SE')`) inserts a non-breaking space.
    // `.first()`: the value legitimately appears twice — the current-reading
    // summary and the recent-readings list both show it.
    await expect(page.getByText(/1.000,0 mil/).first()).toBeVisible();

    await createCustomer(newOwner);

    // Back to the vehicle to reassign it to the second customer.
    await page.goto('/admin/fordon');
    await page.getByPlaceholder('Sök fordon…').fill(plate);
    // A row's first cell is a real link now (UI_UX_AUDIT L3), which is also
    // what disambiguates it from the hidden mobile card carrying the same
    // text: only the visible layout is in the accessibility tree.
    await page.getByRole('link', { name: displayPlate }).click();
    await expect(page).toHaveURL(/\/admin\/fordon\/.+/);

    await page.getByRole('button', { name: 'Byt ägare' }).click();
    await page
      .getByPlaceholder('Sök kund på namn eller telefon')
      .fill(newOwner);
    await page.getByRole('dialog').getByText(newOwner).click();

    // `.first()`: the new owner's name legitimately appears twice — the page
    // header (F6.4.1) and the "Ägare" card both show it.
    await expect(page.getByText(newOwner).first()).toBeVisible();
    // The odometer reading recorded under the first owner survives the
    // reassignment — history hangs off the vehicle, not the customer (§6.3).
    // A regex, not a literal string: Swedish thousands grouping
    // (`Intl.NumberFormat('sv-SE')`) inserts a non-breaking space.
    // `.first()`: the value legitimately appears twice — the current-reading
    // summary and the recent-readings list both show it.
    await expect(page.getByText(/1.000,0 mil/).first()).toBeVisible();
  });

  test('formats phone as entered, flags a non-standard plate, accepts blank optional fields and surfaces server validation errors (F6.6.3)', async ({
    page,
  }) => {
    await login(page);
    const stamp = Date.now();

    // Phone kept exactly as typed (§8.2) and blank optional fields accepted.
    await page.goto('/admin/kunder');
    await page.getByRole('button', { name: 'Ny kund' }).click();
    await page.getByLabel('Namn').fill(`E2E Telefontest ${stamp}`);
    await page.getByLabel('Telefon').fill('070-999 88 77');
    await page.getByRole('button', { name: 'Skapa kund' }).click();
    await expect(page).toHaveURL(/\/admin\/kunder\/.+/);
    await expect(page.getByLabel('Telefon')).toHaveValue('070-999 88 77');
    await expect(page.getByLabel('E-post')).toHaveValue('');

    // A non-standard plate (not six characters) is accepted, not rejected,
    // and flagged for a human rather than blocking the booking (§4.2).
    const nonStandardPlate = `MINBIL${stamp % 100}`;
    await page.getByRole('button', { name: 'Lägg till fordon' }).click();
    await page.getByLabel('Registreringsnummer').fill(nonStandardPlate);
    // The warning shows once the field is blurred, not while still typing.
    await page.getByLabel('Märke').click();
    await expect(page.getByText('Ovanligt registreringsnummer')).toBeVisible();
    await page.getByLabel('Märke').fill('BMW');
    await page.getByLabel('Modell').fill('320d');
    await page.getByRole('button', { name: 'Skapa fordon' }).click();
    await expect(page).toHaveURL(/\/admin\/fordon\/.+/);
    await expect(
      page.getByRole('heading', { name: nonStandardPlate.toUpperCase() }),
    ).toBeVisible();

    // A duplicate registration number is a server-side validation error,
    // surfaced inline rather than swallowed.
    await page.goto('/admin/fordon');
    await page.getByRole('button', { name: 'Nytt fordon' }).click();
    await page.getByLabel('Registreringsnummer').fill(nonStandardPlate);
    await page.getByLabel('Märke').fill('BMW');
    await page.getByLabel('Modell').fill('320d');
    await page.getByRole('button', { name: 'Skapa fordon' }).click();
    await expect(
      page.getByText('Uppgifterna krockar med något som redan finns.'),
    ).toBeVisible();
  });
});
