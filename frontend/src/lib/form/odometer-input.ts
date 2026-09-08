import { isValidOdometerKm, kmToMil, milToKm } from 'shared';
import { parseDecimalParts } from './decimal-input';
import { fail, ok, type ParseResult } from './parse-result';

/**
 * Reads a reading typed in **mil** and returns **km** (F1.3.6).
 *
 * The odometer is stored in km and displayed in mil, and CLAUDE.md is
 * absolute that the conversion happens only in `shared/units.ts` — so this
 * module parses the string and hands the number to `milToKm`, and does not
 * multiply by ten itself. That is the difference between one conversion
 * point and two that can drift.
 *
 * One decimal of mil is 1 km, so a second decimal is below the resolution
 * the column stores and is rejected rather than rounded away.
 */
const MIL_SCALE = 1;

export function parseMilToKm(input: string): ParseResult<number> {
  const parts = parseDecimalParts(input, MIL_SCALE);
  if (!parts.ok) {
    return parts;
  }

  const { sign, integer, fraction } = parts.value;
  if (fraction.length > MIL_SCALE) {
    return fail('precision');
  }

  const mil = sign * Number(`${integer}.${fraction === '' ? '0' : fraction}`);
  if (!Number.isFinite(mil)) {
    return fail('malformed');
  }

  const km = milToKm(mil);
  if (!isValidOdometerKm(km)) {
    return fail('range');
  }
  return ok(km);
}

/** `12345` km → `1234,5` for the input. */
export function formatKmAsMilInput(km: number): string {
  return kmToMil(km).replace('.', ',');
}
