import { isValidOre, ore, toKronor, type Ore } from 'shared';
import { fixedFraction, parseDecimalParts } from './decimal-input';
import { fail, ok, type ParseResult } from './parse-result';

/** Öre are the smallest unit, so a price has at most two decimals. */
const ORE_SCALE = 2;

/**
 * Reads kronor as typed and returns integer öre (F1.3.4).
 *
 * The conversion is integer arithmetic on the digit strings — never
 * `Number(kronor) * 100`, which turns `1234,55` into `123454.99999999999`.
 * PROJECT_SPEC.md §3.2 is the whole reason öre are integers; parsing them
 * through a float at the one point where a human types a price would give
 * the bug back.
 */
export function parseKronorToOre(input: string): ParseResult<Ore> {
  const parts = parseDecimalParts(input, ORE_SCALE);
  if (!parts.ok) {
    return parts;
  }

  const fraction = fixedFraction(parts.value.fraction, ORE_SCALE);
  if (!fraction.ok) {
    return fraction;
  }

  const magnitude = Number(parts.value.integer) * 100 + Number(fraction.value);
  const signed = parts.value.sign * magnitude;

  if (!Number.isSafeInteger(signed) || !isValidOre(signed)) {
    return fail('range');
  }
  return ok(ore(signed));
}

/**
 * The editable form of an amount: `123450` → `1234,50`.
 *
 * A comma, because that is the Swedish decimal separator and this string
 * goes back into a text input the user will edit. Grouping is deliberately
 * absent — `formatCurrency` in `lib/format` is for *display*, and putting
 * its non-breaking spaces into an input makes the caret behave strangely.
 */
export function formatOreForInput(value: Ore): string {
  const negative = value < 0;
  const digits = Math.abs(value)
    .toString()
    .padStart(ORE_SCALE + 1, '0');
  const kronor = digits.slice(0, -ORE_SCALE);
  const fraction = digits.slice(-ORE_SCALE);
  return `${negative ? '-' : ''}${kronor},${fraction}`;
}

/** Kronor as a plain number, for a preview line. Display only. */
export function oreToKronorNumber(value: Ore): number {
  return toKronor(value);
}
