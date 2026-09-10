import { kmToMil, type Ore } from 'shared';

/**
 * Swedish formatting for the inside of a PDF (PROJECT_SPEC.md §9.7, §3.2,
 * §3.5).
 *
 * **Why this does not use `Intl.NumberFormat`, unlike the frontend.** Two
 * reasons, and both are specific to a document rather than a screen:
 *
 * 1. **A PDF embeds a font subset.** `sv-SE` groups thousands with U+00A0, and
 *    CLDR 42 moved several locales to U+202F — a narrow no-break space that
 *    Archivo does not have a glyph for. A separator that depends on the ICU
 *    data bundled with whichever Node the container happens to run is a
 *    missing glyph in a price, on the customer's copy, discovered by nobody.
 * 2. **B0.10.1's determinism rests on the bytes being a function of the
 *    payload.** An `Intl` result is a function of the payload *and* the
 *    runtime's CLDR version, so a Node upgrade would silently change the bytes
 *    of every regenerated document.
 *
 * The frontend keeps `Intl` and should: a browser is where locale data belongs,
 * and a screen has no subset to fall outside of.
 */

/** A plain space, deliberately. See the note above on U+00A0 and U+202F. */
const GROUP_SEPARATOR = ' ';
const DECIMAL_SEPARATOR = ',';

function groupDigits(digits: string): string {
  // Right to left in threes: 1234567 → 1 234 567.
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEPARATOR);
}

/**
 * `129900` → `1 299,00`. Always two decimals, because a price column that
 * sometimes shows them and sometimes does not is harder to check, which is the
 * same reasoning behind §9.3's mandatory tabular figures.
 */
export function formatOre(value: Ore): string {
  const absolute = Math.abs(value);

  // Integer arithmetic on the öre, never `value / 100`. §3.2 stores öre
  // precisely so that no step of this ever meets a float; subtracting the
  // remainder first leaves an exact multiple of 100, and dividing that is
  // exact.
  const fraction = absolute % 100;
  const whole = (absolute - fraction) / 100;

  const formatted = `${groupDigits(String(whole))}${DECIMAL_SEPARATOR}${String(fraction).padStart(2, '0')}`;
  // A Unicode minus (U+2212), not a hyphen: it aligns with the digits in a
  // tabular column, and Archivo has the glyph (checked in B7.1.3).
  return value < 0 ? `−${formatted}` : formatted;
}

/** `1 299,00 kr`, for a total that is read on its own rather than in a column. */
export function formatOreWithUnit(value: Ore): string {
  return `${formatOre(value)} kr`;
}

/** `2500` → `25 %`. Whole percents where possible, one decimal where not. */
export function formatVatRate(vatRateBps: number): string {
  const percent = vatRateBps / 100;
  const rendered = Number.isInteger(percent)
    ? String(percent)
    : percent.toFixed(1).replace('.', DECIMAL_SEPARATOR);
  return `${rendered} %`;
}

/**
 * A `Decimal(12, 3)` quantity as a Swedish decimal — `4.25` → `4,25`.
 *
 * The value arrives as the string the repository produced, never as a number:
 * `Number('0.1')` is where §3.4 stops holding.
 */
export function formatQuantity(quantity: string): string {
  const [whole = '0', fraction] = quantity.split('.');
  const sign = whole.startsWith('-') ? '−' : '';
  const digits = whole.replace('-', '');
  const grouped = groupDigits(digits);
  return fraction === undefined
    ? `${sign}${grouped}`
    : `${sign}${grouped}${DECIMAL_SEPARATOR}${fraction}`;
}

/**
 * Kilometres stored, **mil displayed** (§3.5). The conversion itself is
 * `shared/units.ts` and happens nowhere else; this only puts a Swedish comma
 * in the result.
 */
export function formatOdometerMil(km: number): string {
  // Grouped like every other figure on the page. `12000,0` and `12 000,0` are
  // the same number and only one of them can be read at a glance, which is the
  // same reason §9.3 makes tabular figures mandatory on screen.
  return `${formatQuantity(kmToMil(km))} mil`;
}

/**
 * `2026-09-10`. Swedish convention is already ISO order, which is convenient:
 * a document date needs no locale data at all, and therefore cannot drift with
 * one.
 *
 * The input is a calendar date string, not a `Date`, so that no timezone is
 * involved at the point of rendering — the conversion to the workshop's day
 * has already happened in `shared/time.ts`.
 */
export function formatDate(isoDate: string): string {
  return isoDate;
}
