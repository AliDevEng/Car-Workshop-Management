/**
 * The result of reading a human-typed string into a canonical domain value.
 *
 * A discriminated union rather than `T | null`, because "the field is empty"
 * and "the field holds nonsense" need different answers: an optional field
 * accepts the first and must still reject the second. Returning `null` for
 * both is how an optional price field silently swallows `12,3,4`.
 */
export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: ParseFailure };

/**
 * `empty` — nothing was typed.
 * `malformed` — the characters do not describe a number at all.
 * `precision` — more decimals than the column stores.
 * `range` — a well-formed value the database cannot hold.
 *
 * They are separated because each gets a different Swedish message, and
 * "Ogiltigt värde" for all three tells the user nothing about what to fix.
 */
export type ParseFailure = 'empty' | 'malformed' | 'precision' | 'range';

export function ok<T>(value: T): ParseResult<T> {
  return { ok: true, value };
}

export function fail<T>(reason: ParseFailure): ParseResult<T> {
  return { ok: false, reason };
}

/**
 * Characters a paste can carry where a person typed a space: a normal space,
 * a non-breaking space (what `Intl.NumberFormat('sv-SE')` emits between
 * thousands groups — so re-pasting this application's own output lands
 * here), a narrow no-break space and a thin space.
 */
const GROUPING_WHITESPACE = /[\s\u00A0\u202F\u2009]/g;

/** Strips grouping whitespace so a pasted `1 234,50` parses as typed. */
export function stripGroupingWhitespace(input: string): string {
  return input.replace(GROUPING_WHITESPACE, '');
}
