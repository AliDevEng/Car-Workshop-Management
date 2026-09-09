/**
 * Telephone numbers — PROJECT_SPEC.md §8.2.
 *
 * A customer is stored twice: `phone` is exactly what they gave
 * (`070-123 45 67`), and `phoneNormalised` is the same number in E.164
 * (`+46701234567`). Both columns are indexed, and search matches **either**,
 * because normalising only one side breaks the moment a customer is looked up
 * by the digits they recite — or by a number a colleague wrote a different way
 * last year.
 *
 * This module is the only place that conversion happens, mirroring how
 * `regnr.ts` owns registration-number normalisation. It is deliberately
 * Sweden-first and dependency-free: a full libphonenumber is not in
 * PROJECT_SPEC.md §2.2, and the workshop's numbers are overwhelmingly Swedish.
 * A number that already carries an international prefix is kept as given.
 */

/** Sweden's country calling code. */
const SWEDISH_COUNTRY_CODE = '46';

/**
 * E.164: a `+`, a non-zero country digit, then 5–14 more — 6 to 15 digits in
 * total, which is the standard's ceiling.
 */
const NORMALISED_PHONE_PATTERN = /^\+[1-9]\d{5,14}$/;

/**
 * Reduces a phone number to E.164, as far as a Swedish workshop can be sure.
 *
 * - `+46 70 123 45 67`, `0046-70-1234567` and `070 123 45 67` all become
 *   `+46701234567`.
 * - A leading `+` (other than `+46`) is trusted and only stripped of spacing:
 *   `+1 (202) 555-0143` becomes `+12025550143`.
 * - A number with no country hint and no trunk `0` is assumed Swedish national
 *   form and gets `+46` prepended.
 *
 * The result is not guaranteed to satisfy {@link isNormalisedPhone} — junk in
 * gives junk out — but it is deterministic, which is all search needs: the
 * query is normalised the same way, and the entered form is indexed too.
 */
export function normalisePhone(input: string): string {
  // Keep digits, and a `+` only where it can mean something: at the front.
  const hasPlusPrefix = input.trimStart().startsWith('+');
  const digits = input.replace(/\D/g, '');

  if (digits === '') {
    return '';
  }

  if (hasPlusPrefix) {
    // `+0046…` is someone combining both conventions; collapse it.
    const trimmed = digits.replace(/^00/, '');
    return `+${trimmed}`;
  }

  if (digits.startsWith('00')) {
    return `+${digits.slice(2)}`;
  }

  if (digits.startsWith('0')) {
    return `+${SWEDISH_COUNTRY_CODE}${digits.slice(1)}`;
  }

  if (digits.startsWith(SWEDISH_COUNTRY_CODE)) {
    return `+${digits}`;
  }

  // No trunk zero, no country code — a bare Swedish subscriber number.
  return `+${SWEDISH_COUNTRY_CODE}${digits}`;
}

/**
 * True for a value already in canonical E.164: a `+`, a non-zero country
 * digit, and 6–15 digits in total. Used to decide whether a stored
 * `phoneNormalised` is trustworthy, not to reject input — §8.2 keeps messy
 * numbers rather than turning a real customer away over formatting.
 */
export function isNormalisedPhone(value: string): boolean {
  return NORMALISED_PHONE_PATTERN.test(value);
}
