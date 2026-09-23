import { expect, test, type Page } from '@playwright/test';
import { addStockholmDays, stockholmDate } from 'shared';
import { pickStartTime } from './pickers';

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

/** A real public submission, not a mocked route — F8's inbox needs an
 * actual `BookingRequest` row to confirm or reject. */
async function submitPublicBookingRequest(
  page: Page,
  customerName: string,
  phone: string,
): Promise<void> {
  await page.goto('/boka');
  await page.getByLabel('Namn').fill(customerName);
  await page.getByLabel('Telefon').fill(phone);
  // The real form token (fetched on page load, not mocked here) enforces
  // §6.2's 3-second time trap: a bot fills the whole form instantly, a
  // human does not. This is real backend behaviour, so the test has to
  // wait it out rather than race it.
  await page.waitForTimeout(3_500);
  await page.getByRole('button', { name: 'Skicka förfrågan' }).click();
  await expect(page).toHaveURL(/\/boka\/tack$/);
}

function isWeekendDate(date: string): boolean {
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/**
 * A phone number unique to this test run, not a fixed fixture value.
 * Confirming a request matches an *existing* customer by phone, reusing the
 * oldest match (§8.2) — a fixed phone across repeated runs of this spec
 * would attribute every run's booking to whichever customer that phone
 * first created, so the booking block on the calendar would carry a
 * *previous* run's name instead of this one's.
 */
function uniquePhone(seed: number): string {
  return `070-${String(seed).slice(-7)}`;
}

test.describe('calendar and booking requests (F8)', () => {
  const stamp = Date.now();
  const confirmedCustomer = `E2E Bokning Bekräftad ${stamp}`;
  const rejectedCustomer = `E2E Bokning Avvisad ${stamp}`;
  const tomorrow = addStockholmDays(stockholmDate(new Date()), 1);

  test('submits two real public booking requests', async ({ page }) => {
    await submitPublicBookingRequest(
      page,
      confirmedCustomer,
      uniquePhone(stamp),
    );
    await submitPublicBookingRequest(
      page,
      rejectedCustomer,
      uniquePhone(stamp + 1),
    );
  });

  test('the custom calendar marks Saturday/Sunday and refuses a past date, then confirms a request onto tomorrow (F8.1, F8.2, F8.3)', async ({
    page,
  }) => {
    // `login`'s own URL assertion is a plain-path regex; a query string
    // confuses it (`?` is a regex quantifier), so navigate separately.
    await login(page);
    await page.goto('/admin/bokningar?vy=forfragningar');

    // By cell role: the inbox renders each row twice — a table above `md`
    // and cards below it — and only the visible one is in the accessibility
    // tree (UI_UX_AUDIT L2).
    await page.getByRole('cell', { name: confirmedCustomer }).click();
    await expect(
      page.getByRole('heading', { name: confirmedCustomer }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Bekräfta' }).click();

    await expect(
      page.getByRole('heading', { name: 'Bekräfta bokning' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Välj datum' }).click();

    // The custom calendar (not a native date input): weekend cells carry the
    // oxide tint, and yesterday is a real, disabled button — not hidden.
    const dateButtons = page.locator('[data-date]');
    const dateCount = await dateButtons.count();
    let sawWeekendTint = false;
    for (let index = 0; index < dateCount; index += 1) {
      const button = dateButtons.nth(index);
      const date = await button.getAttribute('data-date');
      if (date !== null && isWeekendDate(date)) {
        await expect(button).toHaveClass(/bg-oxide/);
        sawWeekendTint = true;
      }
    }
    expect(sawWeekendTint).toBe(true);

    const yesterday = addStockholmDays(stockholmDate(new Date()), -1);
    await expect(page.locator(`[data-date="${yesterday}"]`)).toBeDisabled();

    await page.locator(`[data-date="${tomorrow}"]`).click();
    await expect(page.getByRole('button', { name: 'Välj datum' })).toHaveCount(
      0,
    );

    await page.getByRole('button', { name: 'Bekräfta bokning' }).click();
    await expect(
      page.getByRole('heading', { name: 'Bekräfta bokning' }),
    ).toHaveCount(0);

    // Gone from the pending inbox — it is `CONFIRMED` now.
    await page.goto('/admin/bokningar?vy=forfragningar&status=PENDING');
    await expect(
      page.getByRole('cell', { name: confirmedCustomer }),
    ).toHaveCount(0);
  });

  test('the confirmed booking is visible and reschedulable on tomorrow’s day view, keyboard-accessibly (F8.4, F8.6.4)', async ({
    page,
  }) => {
    await login(page);
    await page.goto(`/admin/bokningar?vy=dag&date=${tomorrow}`);

    const block = page.getByRole('button', {
      name: new RegExp(confirmedCustomer),
    });
    // A generous timeout: this run may share the dev database and backend
    // process with other spec files running in parallel workers.
    await expect(block).toBeVisible({ timeout: 15_000 });
    await block.click();

    await expect(
      page.getByRole('heading', { name: confirmedCustomer }),
    ).toBeVisible();

    // Reschedule without ever touching drag-and-drop: the same
    // `PATCH /bookings/:id` the drag gesture also calls, reached entirely
    // by keyboard (F8.6.4).
    await pickStartTime(page, '10:00');
    await page.getByRole('button', { name: 'Spara ändringar' }).click();

    await expect(page.getByText('Bokningen är uppdaterad.')).toBeVisible();
  });

  test('rejects a request with a reason (F8.1.4)', async ({ page }) => {
    await login(page);
    await page.goto('/admin/bokningar?vy=forfragningar');

    await page.getByRole('cell', { name: rejectedCustomer }).click();
    await page.getByRole('button', { name: 'Avvisa' }).click();

    await expect(
      page.getByRole('heading', { name: 'Avvisa förfrågan' }),
    ).toBeVisible();
    await page
      .getByLabel('Anledning')
      .fill('E2E-test: ingen ledig tid inom önskad period.');
    await page.getByRole('button', { name: 'Avvisa förfrågan' }).click();

    await expect(page.getByText('Förfrågan är avvisad.')).toBeVisible();
    await page.goto('/admin/bokningar?vy=forfragningar&status=PENDING');
    await expect(
      page.getByRole('cell', { name: rejectedCustomer }),
    ).toHaveCount(0);
  });
});
