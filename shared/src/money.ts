import { Decimal } from 'decimal.js';

/**
 * Money is an integer number of öre (1/100 krona). Never a float, never a
 * `Decimal`. The brand prevents a plain `number` — a quantity, a count, a
 * kilometre reading — from being passed where money is required.
 * PROJECT_SPEC.md §3.2.
 */
export type Ore = number & { readonly __brand: 'Ore' };

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || !Number.isSafeInteger(value)) {
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
