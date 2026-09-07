import { Decimal } from 'decimal.js';
import { parseDecimal } from './units.js';

/**
 * Article quantities — PROJECT_SPEC.md §3.4.
 *
 * Stored as Prisma `Decimal(12, 3)`, handled with `decimal.js`, and never as a
 * `number`: oil is dispensed in litres (`4.250`) and filters in whole pieces,
 * and one numeric type has to cover both. The `Unit` enum that says which is
 * which lives in `units.ts` alongside the JSON-boundary helpers.
 *
 * The brand is what stops a plain `Decimal` — a VAT factor, a mil reading, an
 * arbitrary intermediate — being passed where a validated stock quantity is
 * required. A value only becomes a `Quantity` by going through `quantity()`
 * or `parseQuantity()`, both of which enforce the column's limits.
 */
export type Quantity = Decimal & { readonly __brand: 'Quantity' };

/** `Decimal(12, 3)`: 12 significant digits, 3 of them after the point. */
export const QUANTITY_SCALE = 3;
export const QUANTITY_PRECISION = 12;

/** 999 999 999.999 — the largest value the column can hold. */
const MAX_QUANTITY = new Decimal(10)
  .toPower(QUANTITY_PRECISION - QUANTITY_SCALE)
  .minus(new Decimal(10).toPower(-QUANTITY_SCALE));

function assertStorable(value: Decimal, label: string): void {
  if (!value.isFinite()) {
    throw new RangeError(
      `${label} must be a finite quantity, got ${value.toString()}`,
    );
  }

  // Rejected, not rounded. A stock quantity silently rounded on the way in is
  // how a ledger and its cached balance drift apart, and §4.2 makes the ledger
  // the truth — it has to be exactly what the caller meant.
  if (value.decimalPlaces() > QUANTITY_SCALE) {
    throw new RangeError(
      `${label} must have at most ${QUANTITY_SCALE} decimal places, got ${value.toString()}`,
    );
  }

  if (value.absoluteValue().greaterThan(MAX_QUANTITY)) {
    throw new RangeError(
      `${label} must be within ±${MAX_QUANTITY.toString()}, got ${value.toString()}`,
    );
  }
}

/**
 * Brands a `Decimal` as a `Quantity`, enforcing the column's scale and range.
 *
 * Deliberately does not accept a `number`: `0.1 + 0.2` is the reason this
 * whole type exists, and an overload taking one would be used by accident.
 */
export function quantity(value: Decimal): Quantity {
  assertStorable(value, 'quantity()');
  return value as Quantity;
}

/** Parses a quantity arriving at a JSON boundary, where it is a string. */
export function parseQuantity(value: string): Quantity {
  return quantity(parseDecimal(value));
}

/**
 * Serialises a quantity for a JSON response. Never `Number(quantity)` — see
 * CLAUDE.md's trap table on returning a Prisma model straight from a route.
 */
export function quantityToString(value: Quantity): string {
  return value.toFixed();
}

export const ZERO_QUANTITY: Quantity = quantity(new Decimal(0));

/**
 * Adding two values that each have at most three decimal places cannot
 * produce a fourth, so no rounding happens here — only the range is
 * re-checked, because a sum can leave the column's bounds.
 */
export function addQuantity(a: Quantity, b: Quantity): Quantity {
  return quantity(a.plus(b));
}

export function subQuantity(a: Quantity, b: Quantity): Quantity {
  return quantity(a.minus(b));
}

/** Used for the compensating `RETURN` movements a reverted work order writes. */
export function negateQuantity(value: Quantity): Quantity {
  return quantity(value.negated());
}

/**
 * `-1`, `0` or `1`, so callers never compare `Decimal` objects with `<` —
 * which compiles, and compares object references.
 *
 * Narrowed explicitly rather than asserted: `comparedTo` is typed as `number`
 * and returns `NaN` for a non-finite operand. That cannot happen to a
 * `Quantity`, but a cast would be a claim rather than a check.
 */
export function compareQuantity(a: Quantity, b: Quantity): -1 | 0 | 1 {
  const result = a.comparedTo(b);
  if (result < 0) {
    return -1;
  }
  return result > 0 ? 1 : 0;
}

/**
 * Stock is allowed to go negative, with a warning — blocking a mechanic from
 * finishing a job because the count is wrong is worse than an inaccurate
 * count (§6.4). This is what raises that warning.
 */
export function isNegativeQuantity(value: Quantity): boolean {
  return value.isNegative() && !value.isZero();
}

export function isZeroQuantity(value: Quantity): boolean {
  return value.isZero();
}
