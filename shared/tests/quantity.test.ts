import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import {
  addQuantity,
  compareQuantity,
  isNegativeQuantity,
  isZeroQuantity,
  negateQuantity,
  parseQuantity,
  QUANTITY_PRECISION,
  QUANTITY_SCALE,
  quantity,
  quantityToString,
  subQuantity,
  ZERO_QUANTITY,
} from '../src/quantity.js';

const q = (value: string) => quantity(new Decimal(value));

describe('quantity construction', () => {
  it('accepts the column limits: 3 decimal places and 9 integer digits', () => {
    expect(QUANTITY_SCALE).toBe(3);
    expect(QUANTITY_PRECISION).toBe(12);
    expect(quantityToString(q('4.250'))).toBe('4.25');
    expect(quantityToString(q('999999999.999'))).toBe('999999999.999');
    expect(quantityToString(q('-999999999.999'))).toBe('-999999999.999');
  });

  it('rejects a fourth decimal place rather than rounding it away', () => {
    // Silently rounding is how the ledger and the cached balance drift apart.
    expect(() => q('4.2501')).toThrow(RangeError);
    expect(() => q('0.0001')).toThrow(RangeError);
  });

  it('rejects a value the Decimal(12,3) column cannot hold', () => {
    expect(() => q('1000000000')).toThrow(RangeError);
    expect(() => q('-1000000000')).toThrow(RangeError);
  });

  it('rejects a non-finite value', () => {
    expect(() => quantity(new Decimal(Infinity))).toThrow(RangeError);
    expect(() => quantity(new Decimal(NaN))).toThrow(RangeError);
  });

  it('parses a quantity arriving as a JSON string', () => {
    expect(quantityToString(parseQuantity('4.250'))).toBe('4.25');
    expect(quantityToString(parseQuantity('12'))).toBe('12');
  });

  it('rejects a malformed JSON quantity', () => {
    expect(() => parseQuantity('not-a-number')).toThrow(RangeError);
    expect(() => parseQuantity('4.2501')).toThrow(RangeError);
  });

  it('serialises as a string, never as a number', () => {
    const serialised = quantityToString(q('4.250'));

    expect(typeof serialised).toBe('string');
    expect(JSON.parse(JSON.stringify({ q: serialised }))).toEqual({
      q: '4.25',
    });
  });

  it('is rejected at compile time when a plain number is used', () => {
    // §3.4: quantities are never a `number`. If a future refactor adds a
    // `number` overload, this line starts compiling and `tsc` flags it.
    // @ts-expect-error a quantity must be a Decimal, not a plain number
    expect(() => quantity(4.25)).toThrow();
  });
});

describe('quantity arithmetic', () => {
  it('adds and subtracts exactly, where a float would not', () => {
    // 0.1 + 0.2 is the entire reason this type exists.
    expect(quantityToString(addQuantity(q('0.1'), q('0.2')))).toBe('0.3');
    expect(quantityToString(subQuantity(q('4.250'), q('0.25')))).toBe('4');
    expect(quantityToString(addQuantity(q('4.001'), q('0.999')))).toBe('5');
  });

  it('allows a negative result — stock may go below zero, with a warning', () => {
    const remaining = subQuantity(q('1'), q('4'));

    expect(quantityToString(remaining)).toBe('-3');
    expect(isNegativeQuantity(remaining)).toBe(true);
  });

  it('re-checks the column bounds after arithmetic', () => {
    expect(() => addQuantity(q('999999999.999'), q('0.001'))).toThrow(
      RangeError,
    );
    expect(() => subQuantity(q('-999999999.999'), q('0.001'))).toThrow(
      RangeError,
    );
  });

  it('negates, for the compensating RETURN movements of a reverted order', () => {
    expect(quantityToString(negateQuantity(q('4.250')))).toBe('-4.25');
    expect(quantityToString(negateQuantity(q('-4.250')))).toBe('4.25');
    expect(quantityToString(negateQuantity(ZERO_QUANTITY))).toBe('0');
  });

  it('starts a ledger from zero', () => {
    expect(isZeroQuantity(ZERO_QUANTITY)).toBe(true);
    expect(quantityToString(addQuantity(ZERO_QUANTITY, q('2.5')))).toBe('2.5');
  });
});

describe('quantity comparison', () => {
  it('orders values without comparing Decimal objects directly', () => {
    expect(compareQuantity(q('1'), q('2'))).toBe(-1);
    expect(compareQuantity(q('2'), q('1'))).toBe(1);
    expect(compareQuantity(q('2.000'), q('2'))).toBe(0);
  });

  it('does not call a zero balance negative', () => {
    expect(isNegativeQuantity(ZERO_QUANTITY)).toBe(false);
    expect(isNegativeQuantity(q('-0.000'))).toBe(false);
    expect(isNegativeQuantity(q('-0.001'))).toBe(true);
  });

  it('does not call a non-zero balance zero', () => {
    expect(isZeroQuantity(q('0.001'))).toBe(false);
    expect(isZeroQuantity(q('0.000'))).toBe(true);
  });
});
