import { isValidQuantityString, QUANTITY_SCALE } from 'shared';
import { parseDecimalParts } from './decimal-input';
import { fail, ok, type ParseResult } from './parse-result';

/**
 * Reads a typed quantity into the canonical decimal **string** the API
 * carries (F1.3.5).
 *
 * A string, not a `Decimal`: quantities cross the wire as strings
 * (PROJECT_SPEC.md §3.4), `shared` validates them as strings
 * (`isValidQuantityString`), and the frontend never does quantity
 * arithmetic. Returning a `Decimal` here would pull `decimal.js` into the
 * browser bundle to hold a value that is only ever handed straight back.
 *
 * The scale comes from `shared`'s `QUANTITY_SCALE`, so the input and the
 * `Decimal(12, 3)` column cannot disagree, and a fourth decimal is
 * **rejected rather than rounded** — the same rule `quantity()` enforces,
 * for the same reason (root README decision log, 2026-09-08).
 */
export function parseQuantityInput(input: string): ParseResult<string> {
  const parts = parseDecimalParts(input, QUANTITY_SCALE);
  if (!parts.ok) {
    return parts;
  }

  const { sign, integer, fraction } = parts.value;
  if (fraction.length > QUANTITY_SCALE) {
    return fail('precision');
  }

  // Trailing zeros are dropped so `2,500` and `2,5` produce one canonical
  // string; the column stores the same number either way, and two spellings
  // of one quantity make request payloads pointlessly different.
  const trimmedFraction = fraction.replace(/0+$/, '');
  const magnitude =
    trimmedFraction === '' ? integer : `${integer}.${trimmedFraction}`;
  const canonical = `${sign < 0 ? '-' : ''}${stripLeadingZeros(magnitude)}`;

  if (!isValidQuantityString(canonical)) {
    return fail('range');
  }
  return ok(canonical);
}

/** `007` → `7`, `0.5` → `0.5`. Keeps a single leading zero before a point. */
function stripLeadingZeros(value: string): string {
  const [integer = '0', fraction] = value.split('.');
  const trimmed = integer.replace(/^0+(?=\d)/, '');
  return fraction === undefined ? trimmed : `${trimmed}.${fraction}`;
}

/**
 * The editable form: the canonical `2.5` shown as `2,5`. The API's decimal
 * point becomes the Swedish comma at the boundary, and only here.
 */
export function formatQuantityForInput(canonical: string): string {
  return canonical.replace('.', ',');
}
