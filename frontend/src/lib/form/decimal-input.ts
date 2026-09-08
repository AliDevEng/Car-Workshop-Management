import {
  fail,
  ok,
  stripGroupingWhitespace,
  type ParseResult,
} from './parse-result';

/**
 * Reading a decimal number the way a Swedish keyboard actually produces one.
 *
 * Shared by every numeric input in the system, because they all face the same
 * three problems and must answer them identically:
 *
 *  1. **Both `,` and `.` are decimal separators here.** The Swedish layout's
 *     numeric keypad emits `.` while the letter row emits `,`, and people use
 *     whichever their hand lands on. Accepting only one is a support call.
 *  2. **Pasted values carry grouping.** `1 234,50` — with the non-breaking
 *     space `Intl.NumberFormat('sv-SE')` emits, so this application's own
 *     rendered output pastes back in cleanly — and `1.234,50` from a
 *     supplier's invoice, and `1,234.50` from an English one.
 *  3. **Guessing wrong is expensive.** `1.500` means 1500 in one convention
 *     and 1.5 in another, and on a price field that is a 1000× error. So the
 *     rule below is written down, exhaustively tested, and — crucially — the
 *     components that use it *show the interpreted value back to the user*
 *     rather than resolving the ambiguity silently.
 *
 * **The field's scale decides, and it is a required argument.** An earlier
 * version resolved a 3-digit tail as grouping regardless of the field, on the
 * reasoning that `1,500` is a thousands group. The tests caught what that
 * does to a quantity: `0,001` — the *smallest quantity the system stores* —
 * came back as `1`, a 1000× error on a stock movement. Three decimals are
 * ordinary in a quantity field and impossible in a price field, so the caller
 * has to say which it is.
 *
 * The rule, in order:
 *
 *  - Both separator characters present → the **last one** is the decimal
 *    point and every earlier one is grouping. Unambiguous in every locale.
 *  - One separator character, appearing more than once → all grouping.
 *  - One separator, appearing once:
 *      - at most `scale` digits after it → decimal separator;
 *      - otherwise exactly 3 digits after it, in a well-formed group shape →
 *        **grouping** (`1,500` is 1500 kr, because öre have two decimals);
 *      - otherwise → a decimal separator with too many digits, which the
 *        caller reports as `precision` rather than as nonsense.
 *  - Anything else → malformed.
 */

const DIGITS = /^\d+$/;

export interface DecimalParts {
  /** `-1` or `1`. Kept separate so `-0,5` does not lose its sign. */
  readonly sign: -1 | 1;
  /** Digits before the decimal separator; `'0'` when none were typed. */
  readonly integer: string;
  /** Digits after it, unpadded; `''` when there is no fractional part. */
  readonly fraction: string;
}

/**
 * Splits a typed decimal into its parts **without going through a float**.
 * `Number('1234.55') * 100` is `123454.99999999999`, and that is precisely
 * the class of bug integer öre exists to prevent (PROJECT_SPEC.md §3.2), so
 * the string is never converted to a number on the way in.
 */
export function parseDecimalParts(
  input: string,
  scale: number,
): ParseResult<DecimalParts> {
  const trimmed = input.trim();
  if (trimmed === '') {
    return fail('empty');
  }

  const withoutSpaces = stripGroupingWhitespace(trimmed);

  const signCharacter = withoutSpaces.at(0);
  const sign: -1 | 1 = signCharacter === '-' ? -1 : 1;
  const unsigned =
    signCharacter === '-' || signCharacter === '+'
      ? withoutSpaces.slice(1)
      : withoutSpaces;

  if (unsigned === '') {
    return fail('malformed');
  }

  const separators = [...unsigned].filter(
    (character) => character === ',' || character === '.',
  );

  if (separators.length === 0) {
    return DIGITS.test(unsigned)
      ? ok({ sign, integer: unsigned, fraction: '' })
      : fail('malformed');
  }

  const lastIndex = Math.max(
    unsigned.lastIndexOf(','),
    unsigned.lastIndexOf('.'),
  );
  const head = unsigned.slice(0, lastIndex);
  const tail = unsigned.slice(lastIndex + 1);

  const bothKinds = unsigned.includes(',') && unsigned.includes('.');
  const headDigits = head.replace(/[,.]/g, '');

  // Is the final separator a decimal point, or the last thousands group?
  const decimalHere = bothKinds
    ? // Mixed separators: the last one is the decimal point, always.
      true
    : separators.length > 1
      ? // Repeated separators of one kind can only be grouping.
        false
      : // A single separator. Within scale it is a fraction; beyond scale it
        // is grouping only if the whole string is a well-formed group.
        tail.length <= scale || !(tail.length === 3 && isGrouped(unsigned));

  if (decimalHere) {
    if (!isGrouped(head) || !DIGITS.test(tail)) {
      return fail('malformed');
    }
    return ok({
      sign,
      integer: headDigits === '' ? '0' : headDigits,
      fraction: tail,
    });
  }

  // Every separator is grouping, so the whole string is one integer.
  if (!isGrouped(unsigned)) {
    return fail('malformed');
  }
  return ok({ sign, integer: unsigned.replace(/[,.]/g, ''), fraction: '' });
}

/**
 * Accepts `1234`, `1 234` (already de-spaced), `1.234`, `1,234,567` — an
 * optional first group of 1–3 digits followed by separated groups of exactly
 * 3. Rejects `1.23.456`, which is the shape a mis-parse produces.
 */
function isGrouped(value: string): boolean {
  if (value === '') {
    return true;
  }
  if (DIGITS.test(value)) {
    return true;
  }
  return /^\d{1,3}([,.]\d{3})+$/.test(value);
}

/**
 * Right-pads or rejects a fractional part against a fixed scale. Rejecting
 * rather than rounding is deliberate and matches `shared`'s `Quantity`: a
 * value quietly rounded on the way in is how a ledger and its cached balance
 * drift apart (root README decision log, 2026-09-08).
 */
export function fixedFraction(
  fraction: string,
  scale: number,
): ParseResult<string> {
  if (fraction.length > scale) {
    return fail('precision');
  }
  return ok(fraction.padEnd(scale, '0'));
}
