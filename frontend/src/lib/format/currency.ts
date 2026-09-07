import { toKronor, type Ore } from 'shared';

const currencyFormatter = new Intl.NumberFormat('sv-SE', {
  style: 'currency',
  currency: 'SEK',
});

/**
 * Formats an integer öre amount from the API for display. Formatting
 * happens only in the frontend (PROJECT_SPEC.md §3.2) — the backend never
 * sends a pre-formatted string.
 */
export function formatCurrency(value: Ore): string {
  return currencyFormatter.format(toKronor(value));
}
