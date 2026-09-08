import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { isValidOre } from '../src/money.js';
import { isStorableQuantity, isValidQuantityString } from '../src/quantity.js';
import {
  ODOMETER_MAX_KM,
  ODOMETER_MIN_KM,
  isValidOdometerKm,
} from '../src/units.js';

/**
 * The predicates the Zod schemas in `src/schemas/` delegate to (B1.5).
 *
 * They exist so a bad value produces a field-level Swedish message at the API
 * boundary instead of a `RangeError` that becomes a 500. Every one of them
 * must agree with the constructor it guards, which is what these tests assert.
 */

describe('isValidOre', () => {
  it('accepts whole öre, including zero and negatives', () => {
    expect(isValidOre(0)).toBe(true);
    expect(isValidOre(34_950)).toBe(true);
    expect(isValidOre(-100)).toBe(true);
  });

  it('rejects a price expressed in kronor', () => {
    expect(isValidOre(349.5)).toBe(false);
  });

  it('rejects values outside exact integer range', () => {
    expect(isValidOre(Number.MAX_SAFE_INTEGER + 2)).toBe(false);
    expect(isValidOre(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidOre(Number.NaN)).toBe(false);
  });
});

describe('isStorableQuantity', () => {
  it('accepts values the Decimal(12, 3) column can hold', () => {
    expect(isStorableQuantity(new Decimal('4.250'))).toBe(true);
    expect(isStorableQuantity(new Decimal('0'))).toBe(true);
    expect(isStorableQuantity(new Decimal('-999999999.999'))).toBe(true);
    expect(isStorableQuantity(new Decimal('999999999.999'))).toBe(true);
  });

  it('rejects a fourth decimal place rather than rounding it', () => {
    expect(isStorableQuantity(new Decimal('4.2501'))).toBe(false);
  });

  it('rejects values beyond the column range', () => {
    expect(isStorableQuantity(new Decimal('1000000000'))).toBe(false);
    expect(isStorableQuantity(new Decimal('-1000000000'))).toBe(false);
  });

  it('rejects non-finite values', () => {
    expect(isStorableQuantity(new Decimal(Number.POSITIVE_INFINITY))).toBe(
      false,
    );
    expect(isStorableQuantity(new Decimal(Number.NaN))).toBe(false);
  });
});

describe('isValidQuantityString', () => {
  it('accepts a decimal string within the column limits', () => {
    expect(isValidQuantityString('4.250')).toBe(true);
    expect(isValidQuantityString('-1')).toBe(true);
  });

  it('rejects malformed syntax before attempting to parse it', () => {
    expect(isValidQuantityString('not-a-number')).toBe(false);
    expect(isValidQuantityString('')).toBe(false);
    expect(isValidQuantityString('4,250')).toBe(false);
  });

  it('rejects syntactically valid strings the column cannot hold', () => {
    // The half this predicate exists for: `isValidDecimalString` alone lets
    // this through to a database error, which reaches the client as a 500
    // rather than a message naming the field.
    expect(isValidQuantityString('1000000000')).toBe(false);
  });
});

describe('isValidOdometerKm', () => {
  it('accepts the §3.5 range inclusively', () => {
    expect(isValidOdometerKm(ODOMETER_MIN_KM)).toBe(true);
    expect(isValidOdometerKm(ODOMETER_MAX_KM)).toBe(true);
    expect(isValidOdometerKm(120_000)).toBe(true);
  });

  it('rejects readings outside it', () => {
    expect(isValidOdometerKm(0)).toBe(false);
    expect(isValidOdometerKm(-1)).toBe(false);
    expect(isValidOdometerKm(ODOMETER_MAX_KM + 1)).toBe(false);
  });

  it('rejects a value in mil that was never converted', () => {
    // 12 000 mil is 120 000 km; the number itself is legal, so this only
    // fails when the value carries the decimal a mil reading has.
    expect(isValidOdometerKm(12_000.5)).toBe(false);
  });
});
