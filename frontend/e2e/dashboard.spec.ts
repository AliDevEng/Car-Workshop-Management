import { expect, test, type Page } from '@playwright/test';
import type { Dashboard } from 'shared';

const ADMIN_EMAIL = 'admin@verkstaden.se';
const ADMIN_PASSWORD = 'utveckling-admin-2026';

const populatedDashboard: Dashboard = {
  date: '2026-09-14',
  from: '2026-09-13T22:00:00.000Z',
  to: '2026-09-14T22:00:00.000Z',
  todaysBookings: [
    {
      id: '01900000-0000-7000-8000-00000000b001',
      bookingRequestId: null,
      customerId: '01900000-0000-7000-8000-0000000c0001',
      vehicleId: '01900000-0000-7000-8000-00000000v001',
      startsAt: '2026-09-14T06:30:00.000Z',
      endsAt: '2026-09-14T08:00:00.000Z',
      assignedUserId: '01900000-0000-7000-8000-00000000u001',
      status: 'SCHEDULED',
      note: null,
      createdAt: '2026-09-13T12:00:00.000Z',
      updatedAt: '2026-09-13T12:00:00.000Z',
      customer: {
        id: '01900000-0000-7000-8000-0000000c0001',
        type: 'PRIVATE',
        name: 'Cecilia Karlsson',
        phone: '070-123 45 67',
      },
      vehicle: {
        id: '01900000-0000-7000-8000-00000000v001',
        registrationNumber: 'ABC12A',
        registrationNumberDisplay: 'ABC 12A',
        make: 'Volvo',
        model: 'V70',
      },
      assignedUser: {
        id: '01900000-0000-7000-8000-00000000u001',
        name: 'Björn Bergström',
        role: 'MECHANIC',
      },
    },
  ],
  unhandledBookingRequests: 2,
  awaitingParts: 1,
  readyForPickup: 1,
  inspectionsDueSoon: [
    {
      id: '01900000-0000-7000-8000-00000000v002',
      registrationNumber: 'DEF45G',
      registrationNumberDisplay: 'DEF 45G',
      make: 'Volkswagen',
      model: 'Transporter',
      nextInspectionDueDate: '2026-09-30',
      customer: {
        id: '01900000-0000-7000-8000-0000000c0003',
        type: 'COMPANY',
        name: 'Solna Bud & Frakt AB',
        phone: '08-55 66 77 88',
      },
    },
  ],
  inspectionsDueSoonCount: 1,
  lowStockArticles: 2,
};

async function login(page: Page, returnTo = '/admin'): Promise<void> {
  await page.goto(`/admin/logga-in?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel('E-post').fill(ADMIN_EMAIL);
  await page.getByLabel('Lösenord').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Logga in' }).click();
  await expect(page).toHaveURL(new RegExp(`${returnTo.replace('/', '\\/')}$`));
}

test.describe('dashboard', () => {
  test('shows seeded dashboard data and links every card to a real filtered page', async ({
    page,
  }) => {
    await login(page);

    await expect(
      page.getByRole('heading', { level: 1, name: /^Idag/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Dagens planering' }),
    ).toBeVisible();
    /*
     * The schedule panel says one of two true things, and which one depends
     * on the developer's database rather than on the code.
     *
     * This used to assert the empty state outright, and it passed for as long
     * as nothing in the seed fell on today. The E2E journeys book "tomorrow",
     * so the first time the suite ran either side of midnight there were 43
     * bookings on the day the dashboard opens on, and an assertion about the
     * *copy* failed for a reason that had nothing to do with the copy. The
     * brief's §14.1 is explicit that a dashboard check like this belongs on
     * an isolated fixture database (F13.1) and that the developer's own
     * database must not be reseeded to make a screenshot come out right.
     *
     * Until that fixture exists, assert the branch the panel actually took.
     * Both halves still fail if the panel renders neither — which is the
     * regression worth catching — and the empty half still pins R02's honest
     * wording, with no claim that the workshop has nothing to do.
     */
    const schedule = page
      .getByRole('heading', { name: 'Dagens planering' })
      .locator('xpath=ancestor::section[1]');
    // Settle first. Counting rows while the skeleton is still up reads zero
    // for a panel that is about to render forty bookings, and then asserts
    // the empty state against them.
    await expect(schedule.getByLabel('Laddar')).toHaveCount(0);
    // Booking rows specifically, not every link in the panel — the empty
    // state has a link of its own, which is the point of it.
    const bookingRows = schedule.locator('a[href*="#booking-"]');
    if ((await bookingRows.count()) === 0) {
      await expect(
        schedule.getByText('Inga bokningar ligger på den här dagen'),
      ).toBeVisible();
      await expect(
        schedule.getByRole('link', { name: 'Öppna planeringen' }),
      ).toBeVisible();
    } else {
      await expect(bookingRows.first()).toBeVisible();
      await expect(
        schedule.getByText('Inga bokningar ligger på den här dagen'),
      ).toHaveCount(0);
    }
    await expect(
      page.getByRole('heading', { name: 'Besiktning inom 60 dagar' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Artiklar under minsta saldo/ }),
    ).toBeVisible();

    await page.getByRole('link', { name: /Obehandlade förfrågningar/ }).click();
    await expect(page).toHaveURL(
      /\/admin\/bokningar\?vy=forfragningar&status=PENDING/,
    );
    await expect(
      page.getByRole('heading', { name: 'Planering' }),
    ).toBeVisible();

    await page.goto('/admin');
    await page.getByRole('link', { name: /Väntar på delar/ }).click();
    await expect(page).toHaveURL(
      /\/admin\/arbetsordrar\?status=AWAITING_PARTS/,
    );
    await expect(
      page.getByRole('heading', { name: 'Arbetsordrar' }),
    ).toBeVisible();

    await page.goto('/admin');
    await page.getByRole('link', { name: /Klara för hämtning/ }).click();
    await expect(page).toHaveURL(
      /\/admin\/arbetsordrar\?status=READY_FOR_PICKUP/,
    );
    await expect(
      page.getByRole('heading', { name: 'Arbetsordrar' }),
    ).toBeVisible();

    await page.goto('/admin');
    // The inspection panel reaches the filtered list through its own footer
    // link, which reads "Visa N till" when the five rows hide something.
    await page
      .getByRole('link', { name: /Öppna besiktningslistan|Visa \d+ till/ })
      .click();
    await expect(page).toHaveURL(/\/admin\/fordon\?besiktning=60-dagar/);
    await expect(page.getByRole('heading', { name: 'Fordon' })).toBeVisible();

    await page.goto('/admin');
    await page
      .getByRole('link', { name: /Artiklar under minsta saldo/ })
      .click();
    await expect(page).toHaveURL(/\/admin\/lager\?lowStock=true/);
    await expect(page.getByRole('heading', { name: 'Lager' })).toBeVisible();
  });

  test('an empty day says only what the data proves', async ({ page }) => {
    /*
     * R02, pinned against a fixture rather than against whatever the
     * developer's database happens to hold today. The copy used to add
     * "Verkstaden kan ta den i lugn ordning" to an empty schedule, which the
     * response does not support: an empty day says nothing about the request
     * inbox or the cars already in the workshop — and here three requests are
     * waiting while the schedule is clear.
     */
    await login(page);
    await page.route('**/api/dashboard**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...populatedDashboard,
          todaysBookings: [],
          unhandledBookingRequests: 3,
          awaitingParts: 0,
          readyForPickup: 0,
          inspectionsDueSoon: [],
          inspectionsDueSoonCount: 0,
          lowStockArticles: 0,
        }),
      });
    });
    await page.goto('/admin');

    const schedule = page
      .getByRole('heading', { name: 'Dagens planering' })
      .locator('xpath=ancestor::section[1]');
    await expect(
      schedule.getByText('Inga bokningar ligger på den här dagen'),
    ).toBeVisible();
    await expect(
      schedule.getByRole('link', { name: 'Öppna planeringen' }),
    ).toBeVisible();
    await expect(schedule.locator('a[href*="#booking-"]')).toHaveCount(0);
    await expect(page.getByText('kan ta den i lugn ordning')).toHaveCount(0);

    // Pending work stays prominent, and a zero reads as zero rather than as
    // something broken.
    await expect(
      page.getByRole('link', { name: /Obehandlade förfrågningar/ }),
    ).toContainText('3');
    await expect(
      page.getByRole('link', { name: /Väntar på delar/ }),
    ).toContainText('Inget väntar just nu');
    // The route into the shortage list survives a zero count.
    await expect(
      page.getByRole('link', { name: /Artiklar under minsta saldo/ }),
    ).toBeVisible();
  });

  test('dashboard endpoint answers the seeded dataset inside the F5 budget', async ({
    page,
  }) => {
    await login(page);

    const elapsedMs = await page.evaluate(async () => {
      const started = performance.now();
      const response = await fetch('/api/dashboard', {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`Dashboard svarade ${String(response.status)}`);
      }
      await response.json();
      return performance.now() - started;
    });

    expect(elapsedMs).toBeLessThan(1000);
  });

  test('renders loading, populated and retryable failure states', async ({
    page,
  }) => {
    await login(page, '/admin/styleguide');

    let shouldFail = true;
    let requestCount = 0;
    await page.route('**/api/dashboard**', async (route) => {
      requestCount += 1;
      if (requestCount === 1) {
        await new Promise((resolve) => {
          setTimeout(resolve, 300);
        });
      }

      if (shouldFail) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Dashboarden är tillfälligt otillgänglig.',
              requestId: 'req-dashboard-test',
            },
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(populatedDashboard),
      });
    });

    await page.goto('/admin');
    await expect(page.getByLabel('Laddar').first()).toBeVisible();
    await expect(
      page.getByText('Dashboarden är tillfälligt otillgänglig.').first(),
    ).toBeVisible();
    await expect(
      page.getByText('Referens: req-dashboard-test').first(),
    ).toBeVisible();

    shouldFail = false;
    await page.getByRole('button', { name: 'Försök igen' }).first().click();

    await expect(page.getByText('ABC 12A · Volvo V70')).toBeVisible();
    await expect(
      page.getByText('Cecilia Karlsson · Björn Bergström'),
    ).toBeVisible();
    await expect(
      page.getByText('DEF 45G · Volkswagen Transporter'),
    ).toBeVisible();
  });
});
