import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import {
  decimalToString,
  isValidDecimalString,
  kmToMil,
  milToKm,
  parseDecimal,
} from '../src/units.js';

describe('kmToMil / milToKm', () => {
  it('converts 0 km', () => {
    expect(kmToMil(0)).toBe('0.0');
    expect(milToKm(0)).toBe(0);
  });

  it('converts a typical odometer reading', () => {
    expect(kmToMil(125)).toBe('12.5');
    expect(milToKm(12.5)).toBe(125);
  });

  it('converts 999 999 km', () => {
    expect(kmToMil(999_999)).toBe('99999.9');
    expect(milToKm(99_999.9)).toBe(999_999);
  });

  it('rejects a non-integer km value', () => {
    expect(() => kmToMil(12.5)).toThrow(RangeError);
  });
});

describe('decimal string boundary helpers', () => {
  it('accepts up to 3 decimal places', () => {
    expect(isValidDecimalString('4.250')).toBe(true);
    expect(isValidDecimalString('1')).toBe(true);
    expect(isValidDecimalString('4.2501')).toBe(false);
    expect(isValidDecimalString('abc')).toBe(false);
  });

  it('parses a valid decimal string to a Decimal', () => {
    expect(parseDecimal('4.250')).toBeInstanceOf(Decimal);
    expect(parseDecimal('4.250').toString()).toBe('4.25');
  });

  it('throws on a malformed decimal string', () => {
    expect(() => parseDecimal('not-a-number')).toThrow(RangeError);
  });

  it('serialises a Decimal as a string, never a number', () => {
    expect(decimalToString(new Decimal('4.250'))).toBe('4.25');
  });

  it('is rejected at compile time when a plain number is used as a Decimal', () => {
    // B1.2.4 compile-time guard — see money/units usage: quantities and
    // money take a `Decimal`, never a plain `number`. This assignment must
    // fail to typecheck; if a future refactor makes it compile, this line
    // starts failing `tsc` and flags the regression.
    // @ts-expect-error a quantity must be a Decimal, not a plain number
    const rejected: Decimal = 5;
    expect(rejected).toBe(5);
  });
});
