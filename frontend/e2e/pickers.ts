import type { Page } from '@playwright/test';

/**
 * Shared interactions with the project's own date and time pickers.
 *
 * Not a spec file (Playwright's default `testMatch` only collects
 * `*.spec.ts`), and shared rather than copied because the alternative is a
 * dozen `.fill('09:00')` calls that quietly stopped describing the interface
 * the moment `<input type="time">` was replaced.
 */

/**
 * Picks a start time in `TimePicker`, which is two listboxes and a "Klar" —
 * no native time input, so nothing here can be `fill`ed.
 *
 * `time` is `HH:MM`, read by position, the same way the component parses it.
 * The minute must be one the picker offers (a five-minute step).
 */
export async function pickStartTime(page: Page, time: string): Promise<void> {
  await page.getByLabel('Starttid').click();
  await page
    .getByRole('listbox', { name: 'Timme' })
    .getByRole('option', { name: time.slice(0, 2), exact: true })
    .click();
  await page
    .getByRole('listbox', { name: 'Minut' })
    .getByRole('option', { name: time.slice(3, 5), exact: true })
    .click();
  await page.getByRole('button', { name: 'Klar' }).click();
}
