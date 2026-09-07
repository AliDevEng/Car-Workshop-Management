import { Decimal } from 'decimal.js';

/**
 * Odometer readings are stored as an integer number of kilometres and
 * displayed in *mil* (1 mil = 10 km), the unit Swedish workshops speak in.
 * This is the only place that conversion happens — PROJECT_SPEC.md §3.5,
 * CLAUDE.md "Traps specific to this project".
 */
export function kmToMil(km: number): string {
  if (!Number.isInteger(km)) {
    throw new RangeError(`kmToMil expects an integer number of km, got ${km}`);
  }
  return new Decimal(km).dividedBy(10).toFixed(1);
}

/** Converts a mil value (which may carry decimals) back to whole km. */
export function milToKm(mil: number): number {
  return new Decimal(mil)
    .times(10)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
}

/**
 * Article quantities. Prisma stores `Decimal(12, 3)`; TypeScript must never
 * narrow one to `number` (PROJECT_SPEC.md §3.4).
 */
export const UNITS = ['PIECE', 'LITRE', 'HOUR', 'KIT'] as const;
export type Unit = (typeof UNITS)[number];

const DECIMAL_STRING_PATTERN = /^-?\d+(\.\d{1,3})?$/;

/** Validates a JSON-boundary decimal string with up to 3 decimal places. */
export function isValidDecimalString(value: string): boolean {
  return DECIMAL_STRING_PATTERN.test(value);
}

/**
 * Parses a decimal string arriving at a JSON boundary. Throws on malformed
 * input rather than silently returning `NaN`-like behaviour.
 */
export function parseDecimal(value: string): Decimal {
  if (!isValidDecimalString(value)) {
    throw new RangeError(`Invalid decimal string: ${value}`);
  }
  return new Decimal(value);
}

/**
 * Serialises a `Decimal` for a JSON response. Never `Number(decimal)` — see
 * CLAUDE.md's trap table entry on returning a Prisma model straight from a
 * route.
 */
export function decimalToString(value: Decimal): string {
  return value.toFixed();
}
