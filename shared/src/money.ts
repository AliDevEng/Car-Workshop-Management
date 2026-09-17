import { Decimal } from 'decimal.js';

/**
 * Money is an integer number of öre (1/100 krona). Never a float, never a
 * `Decimal`. The brand prevents a plain `number` — a quantity, a count, a
 * kilometre reading — from being passed where money is required.
 * PROJECT_SPEC.md §3.2.
 */
export type Ore = number & { readonly __brand: 'Ore' };

/**
 * The range a money **column** can hold. §3.2 fixes the Prisma type as `Int`,
 * which is a PostgreSQL `int4`: ±21 474 836,47 kr, "far beyond any line item
 * here".
 *
 * Stated as a constant rather than left implicit, because the gap between what
 * JavaScript can represent exactly (`Number.MAX_SAFE_INTEGER`) and what the
 * column accepts is four and a half orders of magnitude wide — and everything
 * inside that gap passed validation, reached Postgres, and came back as a
 * `500 INTERNAL_ERROR` instead of the §3.7 field-level message the caller
 * should have got. Found by entering a price of 50 000 000 kr.
 */
export const ORE_MAX = 2_147_483_647;
export const ORE_MIN = -2_147_483_648;

/**
 * True for a value that can be **stored** in a money column: a whole number
 * within `int4`. The predicate is separate from `ore()` so a Zod schema can
 * reject the value at the API boundary and produce a Swedish field-level
 * message, instead of letting a database error become a 500.
 */
export function isValidOre(value: number): boolean {
  return Number.isSafeInteger(value) && value >= ORE_MIN && value <= ORE_MAX;
}

/**
 * True for a value the arithmetic below may carry.
 *
 * Deliberately wider than `isValidOre`: a *document total* is the sum of many
 * stored line values, and a hundred lines each within `int4` can legitimately
 * sum past it. Rounding that sum mid-calculation, or throwing from `addOre`,
 * would corrupt or crash a perfectly ordinary read — §3.3 requires totals to be
 * the exact sum of the already-rounded lines. The bound a total has to clear is
 * applied where a total is *persisted* (a quote freezes its numbers, §6.6),
 * not where it is computed.
 */
export function isComputableOre(value: number): boolean {
  return Number.isSafeInteger(value);
}

function assertSafeInteger(value: number, label: string): void {
  if (!isComputableOre(value)) {
    throw new RangeError(`${label} must be a safe integer, got ${value}`);
  }
}

/** Brands a plain integer as `Ore`. Throws if it is not a safe integer. */
export function ore(value: number): Ore {
  assertSafeInteger(value, 'ore()');
  return value as Ore;
}

/**
 * Converts kronor (which may carry decimals, e.g. `349.5`) to whole öre,
 * rounding half away from zero.
 */
export function fromKronor(kronor: number): Ore {
  const rounded = new Decimal(kronor)
    .times(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
  return ore(rounded);
}

/** Converts whole öre back to kronor, e.g. `34950` → `349.5`. */
export function toKronor(value: Ore): number {
  return new Decimal(value).dividedBy(100).toNumber();
}

export function addOre(a: Ore, b: Ore): Ore {
  return ore(a + b);
}

export function subOre(a: Ore, b: Ore): Ore {
  return ore(a - b);
}

/**
 * Multiplies an öre amount by an arbitrary-precision factor (typically a
 * `Decimal` quantity), rounding the result half away from zero to the
 * nearest whole öre.
 */
export function multiplyOre(value: Ore, factor: Decimal): Ore {
  const rounded = new Decimal(value)
    .times(factor)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
  return ore(rounded);
}

export interface LineInput {
  readonly unitPriceOre: Ore;
  readonly quantity: Decimal;
  readonly vatRateBps: number;
}

export interface LineTotals {
  readonly netOre: Ore;
  readonly vatOre: Ore;
  readonly grossOre: Ore;
}

/**
 * Line calculation in the exact order required by PROJECT_SPEC.md §3.3:
 * net is rounded first, VAT is computed from the rounded net, and gross is
 * their sum. Recomputing VAT from an unrounded net produces a different
 * result and must never be done.
 */
export function calculateLine(input: LineInput): LineTotals {
  const netOre = multiplyOre(input.unitPriceOre, input.quantity);
  const vatOre = multiplyOre(
    netOre,
    new Decimal(input.vatRateBps).dividedBy(10_000),
  );
  const grossOre = addOre(netOre, vatOre);
  return { netOre, vatOre, grossOre };
}

/**
 * Sums already-rounded line totals. Never recomputes VAT from a summed net —
 * the two methods differ by öre, and the printed document must match its own
 * lines (§3.3).
 */
export function sumLines(lines: readonly LineTotals[]): LineTotals {
  let netOre = ore(0);
  let vatOre = ore(0);
  let grossOre = ore(0);
  for (const line of lines) {
    netOre = addOre(netOre, line.netOre);
    vatOre = addOre(vatOre, line.vatOre);
    grossOre = addOre(grossOre, line.grossOre);
  }
  return { netOre, vatOre, grossOre };
}

/**
 * True when every value in a set of totals fits a money column.
 *
 * Used where a document **freezes** its numbers — a quote's `netOre`/`vatOre`/
 * `grossOre`/`roundingOre` are stored `Int` columns (§4.2). A work order
 * computes its totals on read and so never needs this; a quote does, and
 * without it a large-enough order produced a `500` from Postgres at the moment
 * of sending rather than a Swedish message at the moment of quoting.
 */
export function isStorableTotal(values: readonly number[]): boolean {
  return values.every((value) => isValidOre(value));
}

export interface OresRounding {
  /** The gross total rounded to the nearest whole krona. */
  readonly roundedOre: Ore;
  /** Display-only difference between the rounded and exact total. */
  readonly roundingOre: Ore;
}

/**
 * `öresavrundning` — cash rounding of a document's final total to the
 * nearest whole krona, half away from zero. Display-only: it is stored on
 * the document but never feeds back into line values (§3.3).
 */
export function calculateOresRounding(grossOre: Ore): OresRounding {
  const roundedOre = ore(
    new Decimal(grossOre)
      .dividedBy(100)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .times(100)
      .toNumber(),
  );
  return { roundedOre, roundingOre: subOre(roundedOre, grossOre) };
}
