import { expect, test, type Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@verkstaden.se';
const ADMIN_PASSWORD = 'utveckling-admin-2026';
const MECHANIC_EMAIL = 'mekaniker@verkstaden.se';
const MECHANIC_PASSWORD = 'utveckling-mekaniker-2026';

test.describe.configure({ mode: 'serial' });

async function login(
  page: Page,
  returnTo = '/admin',
  credentials: {
    readonly email: string;
    readonly password: string;
  } = { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
): Promise<void> {
  await page.goto(`/admin/logga-in?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel('E-post').fill(credentials.email);
  await page.getByLabel('Lösenord').fill(credentials.password);
  await page.getByRole('button', { name: 'Logga in' }).click();
  await expect(page).toHaveURL(new RegExp(`${returnTo.replace('/', '\\/')}$`));
}

test('unauthenticated admin visits redirect to login and return after sign-in', async ({
  page,
}) => {
  await page.goto('/admin/styleguide');

  await expect(page).toHaveURL(/\/admin\/logga-in\?returnTo=%2Fadmin%2Fstyleguide/);
  await page.getByLabel('E-post').fill(ADMIN_EMAIL);
  await page.getByLabel('Lösenord').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Logga in' }).click();

  await expect(page).toHaveURL(/\/admin\/styleguide$/);
  await expect(page.getByRole('heading', { name: 'Stilguide' })).toBeVisible();
});

test('login refuses an external return path', async ({ page }) => {
  await page.goto(
    `/admin/logga-in?returnTo=${encodeURIComponent('https://example.com/admin')}`,
  );
  await page.getByLabel('E-post').fill(ADMIN_EMAIL);
  await page.getByLabel('Lösenord').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Logga in' }).click();

  await expect(page).toHaveURL(/\/admin$/);
});

test('logout clears the protected shell', async ({ page }) => {
  await login(page);

  await page.getByRole('button', { name: 'Logga ut' }).click();
  await expect(page).toHaveURL(/\/admin\/logga-in$/);

  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/logga-in\?returnTo=%2Fadmin/);
});

test('global search opens from the keyboard and navigates to vehicles', async ({
  page,
}) => {
  await login(page);

  await page.keyboard.press('/');
  await page.getByPlaceholder('Sök på namn, telefon eller regnr').fill('ABC');
  await page.getByText('ABC 12A').click();

  await expect(page).toHaveURL(/\/admin\/fordon\//);
});

test('forbidden admin actions return a clear Swedish 403 envelope', async ({
  page,
}) => {
  await login(page, '/admin', {
    email: MECHANIC_EMAIL,
    password: MECHANIC_PASSWORD,
  });

  const response = await page.evaluate(async () => {
    const result = await fetch('/api/users', { credentials: 'include' });
    const body: unknown = await result.json();
    return { status: result.status, body };
  });

  expect(response.status).toBe(403);
  expect(JSON.stringify(response.body)).toContain('behörighet');
});
