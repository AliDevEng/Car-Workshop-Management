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

function uniqueStandardPlate(prefix: string): string {
  const now = Date.now();
  const digits = String(now % 100).padStart(2, '0');
  const letter = LETTERS[now % LETTERS.length];
  return `${prefix}${digits}${letter}`;
}

/**
 * Builds a completed work order with two lines — the minimum a quote and a
 * protocol can both be created from — the same steps `work-orders.spec.ts`
 * already drives, repeated here so this file does not depend on run order.
 */
async function createCompletedWorkOrder(
  page: Page,
  customerName: string,
  plate: string,
): Promise<void> {
  await page.goto('/admin/kunder');
  await page.getByRole('button', { name: 'Ny kund' }).click();
  await page.getByLabel('Namn').fill(customerName);
  await page.getByLabel('Telefon').fill('070-555 22 33');
  await page.getByRole('button', { name: 'Skapa kund' }).click();
  await expect(page).toHaveURL(/\/admin\/kunder\/.+/);

  await page.getByRole('button', { name: 'Lägg till fordon' }).click();
  await page.getByLabel('Registreringsnummer').fill(plate);
  await page.getByLabel('Märke').fill('Testmärke');
  await page.getByLabel('Modell').fill('Testmodell');
  await page.getByRole('button', { name: 'Skapa fordon' }).click();
  await expect(page).toHaveURL(/\/admin\/fordon\/.+/);

  await page.goto('/admin/arbetsordrar');
  await page.getByRole('button', { name: 'Ny arbetsorder' }).click();
  await page.getByLabel('Sök fordon').fill(plate);
  // Scoped to the dialog: the list behind it renders its rows twice — a
  // table above `md` and cards below it (UI_UX_AUDIT L2).
  await page
    .getByRole('dialog')
    .getByText(plate.slice(0, 3), { exact: false })
    .first()
    .waitFor();
  await page.locator('.max-h-40 button').first().click();
  await page.getByLabel('Beskrivning').fill('F10 e2e: service');
  await page.getByRole('button', { name: 'Skapa arbetsorder' }).click();
  await expect(page).toHaveURL(/\/admin\/arbetsordrar\/.+/);

  await page.getByRole('button', { name: 'Lägg till rad' }).click();
  await page.getByRole('dialog').getByLabel('Typ').click();
  await page.getByRole('option', { name: 'Arbete' }).click();
  await page.getByRole('dialog').getByLabel('Beskrivning').fill('Service');
  await page.getByRole('dialog').getByLabel('Antal').fill('1');
  await page.getByRole('dialog').getByLabel('Á-pris (exkl. moms)').fill('800');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Lägg till rad' })
    .click();
  await expect(page.getByText('Raden är tillagd.')).toBeVisible();

  await page.getByRole('button', { name: 'Påbörja arbetet' }).click();
  await expect(page.getByText('Status ändrad till Pågår.')).toBeVisible();

  await page
    .getByRole('button', { name: 'Slutför arbetsorder' })
    .first()
    .click();
  await page.locator('#complete-odometer-out').fill('12345');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Slutför arbetsorder' })
    .click();
  await expect(page.getByText('Arbetsordern är slutförd.')).toBeVisible();
}

test.describe('quotes and service protocols (F10)', () => {
  const stamp = Date.now();
  const customerName = `F10 E2E ${stamp}`;
  const plate = uniqueStandardPlate('DOC');

  test('a quote can be created, sent, previewed, accepted and revised (F10.1, F10.2, F10.5, F10.6)', async ({
    page,
  }) => {
    await login(page);
    await createCompletedWorkOrder(page, customerName, plate);

    await page.getByRole('button', { name: 'Skapa offert' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Skapa offert' })
      .click();

    // Navigated to the new quote's own page.
    await expect(page).toHaveURL(/\/offerter\/.+/);
    await expect(
      page.getByRole('heading', { name: /Utkast v1/ }),
    ).toBeVisible();
    await expect(page.getByText('Utkast', { exact: true })).toBeVisible();
    // The frontend never recalculates a total — this is `workOrder.totals`
    // read straight off the quote (F10.6.3): 800 kr net + 25 % VAT.
    await expect(page.getByText('1 000,00 kr', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Skicka offert' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Skicka offert' })
      .click();
    await expect(page.getByText('Offerten är skickad.')).toBeVisible();
    await expect(page.getByText('Skickad', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /^OF-2026-/ }),
    ).toBeVisible();

    // F10.5.1 — the inline PDF preview loads (a real fetched blob, not a
    // broken frame) and the download fallback points at the real file.
    await expect(page.locator('iframe')).toHaveAttribute('src', /^blob:/, {
      timeout: 15_000,
    });
    await expect(page.getByRole('link', { name: 'Ladda ner' })).toHaveAttribute(
      'href',
      /\/api\/documents\/.+\/file/,
    );

    await page.getByRole('button', { name: 'Registrera accepterad' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Registrera accepterad' })
      .click();
    await expect(
      page.getByText('Svaret är registrerat: accepterad.'),
    ).toBeVisible();
    await expect(page.getByText('Accepterad', { exact: true })).toBeVisible();

    // F10.2.3 — a sent (here: accepted) quote is read-only; only a new
    // version is on offer, and it explains why.
    await expect(
      page.getByText('En skickad offert är skrivskyddad.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Skapa ny version' }).click();
    await expect(
      page.getByText('En ny version av offerten är skapad.'),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Utkast v2/ }),
    ).toBeVisible();

    // Back on the work order, both versions are listed (F10.2.1).
    await page.goto(page.url().replace(/\/offerter\/.+$/, ''));
    await expect(page.getByText(/Utkast v2/)).toBeVisible();
    await expect(page.getByText(/^OF-2026-/)).toBeVisible();
  });

  test('a service protocol requires every checklist item answered, then finalises and can be corrected (F10.3, F10.4, F10.6)', async ({
    page,
  }) => {
    await login(page);
    const protocolPlate = uniqueStandardPlate('PRO');
    const protocolCustomer = `${customerName} protokoll`;
    await createCompletedWorkOrder(page, protocolCustomer, protocolPlate);

    await page.getByRole('link', { name: 'Skapa serviceprotokoll' }).click();
    await expect(page).toHaveURL(/\/protokoll\/ny$/);

    // No template chosen yet: submitting is refused silently (no checklist
    // to be incomplete) rather than navigating anywhere.
    await page.getByRole('button', { name: 'Skapa protokoll' }).click();
    await expect(page).toHaveURL(/\/protokoll\/ny$/);

    await page.getByLabel('Checklistmall').click();
    await page.getByRole('option', { name: /E2E Liten service/ }).click();
    await expect(page.getByText('Oljeniva')).toBeVisible();
    await expect(page.getByText('Bromsar')).toBeVisible();

    await page.getByRole('button', { name: 'Skapa protokoll' }).click();
    await expect(page.getByText('2 punkter saknar svar.')).toBeVisible();
    await expect(page.getByText('Obesvarad')).toHaveCount(2);

    await page
      .getByRole('group', { name: 'Oljeniva' })
      .getByRole('button', { name: 'Utan anmärkning' })
      .click();
    await page
      .getByRole('group', { name: 'Bromsar' })
      .getByRole('button', { name: 'Anmärkning', exact: true })
      .click();
    await expect(page.getByText('Obesvarad')).toHaveCount(0);

    await page.locator('#protocol-odometer').fill('1234,5');

    await page.getByRole('button', { name: 'Skapa protokoll' }).click();
    await expect(
      page.getByText('Serviceprotokollet är skapat som utkast.'),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/protokoll\/[^/]+$/);
    await expect(page.getByText('Utkast', { exact: true })).toBeVisible();

    await page
      .getByRole('button', { name: 'Finalisera serviceprotokoll' })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Finalisera serviceprotokoll' })
      .click();
    await expect(
      page.getByText('Serviceprotokollet är finaliserat.'),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /^SP-2026-/ }),
    ).toBeVisible();
    await expect(
      page.getByText('Finaliserad', { exact: true }).first(),
    ).toBeVisible();
    await expect(page.locator('iframe')).toHaveAttribute('src', /^blob:/, {
      timeout: 15_000,
    });

    // F10.4's "immutable once finalised": the answer form is gone, replaced
    // by a read-only checklist summary.
    await expect(
      page.getByRole('button', { name: 'Finalisera serviceprotokoll' }),
    ).toHaveCount(0);

    await page.getByRole('link', { name: 'Skapa korrigering' }).click();
    await expect(page).toHaveURL(/\/protokoll\/ny\?korrigera=.+/);
    // Pre-filled from the original (§6.7's correction, not a blank form).
    await expect(page.getByText('Oljeniva')).toBeVisible();
    await expect(page.getByText('Bromsar')).toBeVisible();
    await expect(page.getByText('Obesvarad')).toHaveCount(0);
  });
});
