import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import {
  addOre,
  calculateLine,
  calculateOresRounding,
  fromKronor,
  multiplyOre,
  ore,
  subOre,
  sumLines,
  toKronor,
} from '../src/money.js';

describe('ore / fromKronor / toKronor', () => {
  it('brands a safe integer', () => {
    expect(ore(34_950)).toBe(34_950);
  });

  it('rejects a non-integer', () => {
    expect(() => ore(10.5)).toThrow(RangeError);
  });

  it('converts kronor with decimals to öre', () => {
    expect(fromKronor(349.5)).toBe(34_950);
    expect(toKronor(ore(34_950))).toBe(349.5);
  });

  it('rounds a half-öre boundary away from zero', () => {
    // 0,005 kr = 0.5 öre both ways
    expect(fromKronor(0.005)).toBe(1);
    expect(fromKronor(-0.005)).toBe(-1);
  });
});

describe('addOre / subOre', () => {
  it('adds and subtracts negatives correctly', () => {
    expect(addOre(ore(100), ore(-150))).toBe(-50);
    expect(subOre(ore(-100), ore(50))).toBe(-150);
  });
});

describe('multiplyOre', () => {
  it('rounds half away from zero for both signs', () => {
    expect(multiplyOre(ore(1), new Decimal('0.5'))).toBe(1);
    expect(multiplyOre(ore(-1), new Decimal('0.5'))).toBe(-1);
  });

  it('handles a quantity of 0.001', () => {
    expect(multiplyOre(ore(100_000), new Decimal('0.001'))).toBe(100);
  });
});

describe('calculateLine', () => {
  it('follows the exact §3.3 order: round net, then VAT from rounded net', () => {
    const line = calculateLine({
      unitPriceOre: ore(3_333),
      quantity: new Decimal(1),
      vatRateBps: 2_500,
    });
    expect(line.netOre).toBe(3_333);
    expect(line.vatOre).toBe(833); // round(3333 * 0.25) = round(833.25) = 833
    expect(line.grossOre).toBe(4_166);
  });

  it('supports 0 % VAT', () => {
    const line = calculateLine({
      unitPriceOre: ore(10_000),
      quantity: new Decimal(2),
      vatRateBps: 0,
    });
    expect(line).toEqual({ netOre: 20_000, vatOre: 0, grossOre: 20_000 });
  });

  it('stays exact near the Postgres Int32 ceiling', () => {
    const line = calculateLine({
      unitPriceOre: ore(2_147_483_647),
      quantity: new Decimal(1),
      vatRateBps: 0,
    });
    expect(line.grossOre).toBe(2_147_483_647);
  });
});

describe('sumLines', () => {
  it('sums 33 already-rounded lines of 33,33 kr rather than recomputing VAT', () => {
    const line = calculateLine({
      unitPriceOre: ore(3_333),
      quantity: new Decimal(1),
      vatRateBps: 2_500,
    });
    const total = sumLines(Array<typeof line>(33).fill(line));

    // Sum-then-round: 33 * 833 = 27489. Recomputing VAT from the summed net
    // (33 * 3333 = 109989) would give round(109989 * 0.25) = 27497 —
    // deliberately a different, wrong number.
    expect(total.netOre).toBe(33 * 3_333);
    expect(total.vatOre).toBe(33 * 833);
    expect(total.grossOre).toBe(33 * 4_166);
  });
});

describe('calculateOresRounding', () => {
  it('rounds the gross total to the nearest whole krona, display-only', () => {
    const result = calculateOresRounding(ore(10_049));
    expect(result.roundedOre).toBe(10_000);
    expect(result.roundingOre).toBe(-49);
  });

  it('rounds a negative total away from zero', () => {
    const result = calculateOresRounding(ore(-10_050));
    expect(result.roundedOre).toBe(-10_100);
    expect(result.roundingOre).toBe(-50);
  });
});
