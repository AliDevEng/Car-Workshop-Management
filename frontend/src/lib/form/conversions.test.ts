import { ore, QUANTITY_SCALE, type Ore } from 'shared';
import { describe, expect, it } from 'vitest';
import { parseDecimalParts } from './decimal-input';
import { formatOreForInput, parseKronorToOre } from './money-input';
import { formatKmAsMilInput, parseMilToKm } from './odometer-input';
import { formatQuantityForInput, parseQuantityInput } from './quantity-input';

/** Money's scale — most separator cases are written against it. */
const MONEY = 2;

/** The four space characters a paste can carry between thousands groups. */
const SPACE = ' ';
const NBSP = ' '; // what Intl.NumberFormat('sv-SE') emits
const NNBSP = ' ';
const THIN = ' ';

describe('parseDecimalParts — separator interpretation', () => {
  it.each([
    ['1250,50', 1, '1250', '50'],
    ['1250.50', 1, '1250', '50'],
    ['1250,5', 1, '1250', '5'],
    ['-12,5', -1, '12', '5'],
    ['+12,5', 1, '12', '5'],
    [',5', 1, '0', '5'],
    ['.5', 1, '0', '5'],
    ['450', 1, '450', ''],
  ])('reads %s', (input, sign, integer, fraction) => {
    const result = parseDecimalParts(input, MONEY);
    expect(result.ok && result.value).toEqual({ sign, integer, fraction });
  });

  it('reads a 3-digit tail as grouping when the scale cannot hold it', () => {
    // Money has two decimals, so `1,500` can only be a thousands group.
    expect(parseDecimalParts('1,500', MONEY)).toEqual({
      ok: true,
      value: { sign: 1, integer: '1500', fraction: '' },
    });
  });

  it('reads the same 3-digit tail as a fraction at quantity scale', () => {
    // The regression this argument exists for. At scale 3, `0,001` is the
    // smallest quantity the system stores; resolving the tail as grouping
    // turned it into `1` — a 1000× error on a stock movement.
    expect(parseDecimalParts('0,001', QUANTITY_SCALE)).toEqual({
      ok: true,
      value: { sign: 1, integer: '0', fraction: '001' },
    });
  });

  it('reads a 3-digit tail as a fraction when the head cannot be a group', () => {
    expect(parseDecimalParts('1234,500', MONEY)).toEqual({
      ok: true,
      value: { sign: 1, integer: '1234', fraction: '500' },
    });
  });

  it.each([
    ['1.234,50', '1234', '50'], // Swedish/German paste
    ['1,234.50', '1234', '50'], // English paste
    ['1.234.567,25', '1234567', '25'],
  ])('uses the last separator when both appear: %s', (input, int, frac) => {
    const result = parseDecimalParts(input, MONEY);
    expect(result.ok && result.value).toMatchObject({
      integer: int,
      fraction: frac,
    });
  });

  it.each([
    ['plain space', SPACE],
    ['non-breaking space', NBSP],
    ['narrow no-break space', NNBSP],
    ['thin space', THIN],
  ])('strips a %s between thousands groups', (_label, space) => {
    const result = parseDecimalParts(`1${space}234,50`, MONEY);
    expect(result.ok && result.value).toMatchObject({
      integer: '1234',
      fraction: '50',
    });
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
  ])('reports %j as %s', (input, reason) => {
    expect(parseDecimalParts(input, MONEY)).toEqual({ ok: false, reason });
  });

  it.each(['abc', '12kr', '1,2,3', '1.23.456', '-', '1,2.3', '12,,5'])(
    'rejects %j as malformed',
    (input) => {
      expect(parseDecimalParts(input, MONEY)).toEqual({
        ok: false,
        reason: 'malformed',
      });
    },
  );
});

describe('parseKronorToOre', () => {
  it.each([
    ['450', 45000],
    ['1250,50', 125050],
    ['1250.50', 125050],
    ['0,05', 5],
    ['0', 0],
    ['-12,50', -1250],
    [`1${NBSP}234,50`, 123450],
  ])('reads %s as %d öre', (input, expected) => {
    const result = parseKronorToOre(input);
    expect(result.ok && result.value).toBe(expected);
  });

  it('does not go through a float', () => {
    // Number('1234.55') * 100 === 123454.99999999999
    const result = parseKronorToOre('1234,55');
    expect(result.ok && result.value).toBe(123455);
  });

  it("round-trips this application's own rendered price", () => {
    // formatCurrency emits a non-breaking space; copying a price off the
    // screen and pasting it back into an input has to work.
    const rendered = new Intl.NumberFormat('sv-SE', {
      minimumFractionDigits: 2,
    }).format(1234.5);
    const result = parseKronorToOre(rendered);
    expect(result.ok && result.value).toBe(123450);
  });

  it('rejects a third decimal rather than rounding it away', () => {
    // A 4-digit head cannot be a thousands group, so the tail is a fraction
    // — and öre have two decimals.
    expect(parseKronorToOre('1234,567')).toEqual({
      ok: false,
      reason: 'precision',
    });
  });

  it.each([
    [0, '0,00'],
    [5, '0,05'],
    [125050, '1250,50'],
    [-1250, '-12,50'],
  ])('formats %d öre as %s', (input, expected) => {
    expect(formatOreForInput(ore(input))).toBe(expected);
  });

  it('round-trips every formatted amount', () => {
    for (const amount of [0, 1, 99, 100, 12345, -6789]) {
      const formatted = formatOreForInput(ore(amount));
      const parsed = parseKronorToOre(formatted);
      expect(parsed.ok && parsed.value).toBe(amount);
    }
  });
});

describe('parseQuantityInput', () => {
  it.each([
    ['2', '2'],
    ['2,5', '2.5'],
    ['2.5', '2.5'],
    ['0,001', '0.001'],
    ['2,500', '2.5'],
    ['007', '7'],
    ['-1,5', '-1.5'],
  ])('reads %s as %s', (input, expected) => {
    const result = parseQuantityInput(input);
    expect(result.ok && result.value).toBe(expected);
  });

  it('rejects a fourth decimal rather than rounding it', () => {
    // The stock ledger is the truth and Article.stockQuantity is a cache; a
    // quantity rounded on the way in is how the two drift apart.
    expect(parseQuantityInput('0,0001')).toEqual({
      ok: false,
      reason: 'precision',
    });
  });

  it('rejects a value beyond Decimal(12, 3)', () => {
    expect(parseQuantityInput('1234567890,5')).toEqual({
      ok: false,
      reason: 'range',
    });
  });

  it('shows the canonical string with a Swedish separator', () => {
    expect(formatQuantityForInput('2.5')).toBe('2,5');
    expect(formatQuantityForInput('7')).toBe('7');
  });
});

describe('parseMilToKm', () => {
  it.each([
    ['1234,5', 12345],
    ['1234.5', 12345],
    ['0,1', 1],
    ['1', 10],
    ['20000', 200000],
  ])('reads %s mil as %d km', (input, expected) => {
    const result = parseMilToKm(input);
    expect(result.ok && result.value).toBe(expected);
  });

  it('rejects a second decimal — 0,01 mil is below the stored resolution', () => {
    expect(parseMilToKm('12,34')).toEqual({ ok: false, reason: 'precision' });
  });

  it.each([
    ['0', 'range'], // §3.5's range starts at 1 km
    ['200001', 'range'], // above 2 000 000 km
    ['-5', 'range'],
  ])('rejects %s as %s', (input, reason) => {
    expect(parseMilToKm(input)).toEqual({ ok: false, reason });
  });

  it('formats km back into mil for the input', () => {
    expect(formatKmAsMilInput(12345)).toBe('1234,5');
    expect(formatKmAsMilInput(10)).toBe('1,0');
  });

  it("round-trips through shared's conversion only", () => {
    for (const km of [1, 10, 12345, 999999, 2000000]) {
      const shown = formatKmAsMilInput(km);
      const parsed = parseMilToKm(shown);
      expect(parsed.ok && parsed.value).toBe(km);
    }
  });
});

describe('branding', () => {
  it('produces a value assignable to Ore', () => {
    const result = parseKronorToOre('10,00');
    if (!result.ok) {
      throw new Error('expected a successful parse');
    }
    const amount: Ore = result.value;
    expect(amount).toBe(1000);
  });
});
