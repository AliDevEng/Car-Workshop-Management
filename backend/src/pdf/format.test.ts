import { describe, expect, it } from 'vitest';
import { ore } from 'shared';
import {
  formatDate,
  formatOdometerMil,
  formatOre,
  formatOreWithUnit,
  formatQuantity,
  formatVatRate,
} from './format.js';

/**
 * B7.4 — the Swedish formatting a document prints.
 *
 * Worth unit-testing rather than only asserting through a rendered PDF,
 * because the interesting cases are arithmetic edges that would be tedious to
 * reach through a template and easy to miss there.
 */

describe('formatOre', () => {
  it('always shows two decimals', () => {
    expect(formatOre(ore(0))).toBe('0,00');
    expect(formatOre(ore(5))).toBe('0,05');
    expect(formatOre(ore(50))).toBe('0,50');
    expect(formatOre(ore(100))).toBe('1,00');
  });

  it('groups thousands with a plain space', () => {
    expect(formatOre(ore(129_900))).toBe('1 299,00');
    expect(formatOre(ore(123_456_789))).toBe('1 234 567,89');

    // Not U+00A0 and not U+202F. Archivo has no glyph for the latter, and
    // `Intl` chose it for several locales in CLDR 42 — which would put a
    // missing glyph in the middle of a price. See the module comment.
    expect(formatOre(ore(129_900))).not.toContain(' ');
    expect(formatOre(ore(129_900))).not.toContain(' ');
  });

  it('renders a negative amount with a Unicode minus', () => {
    // U+2212, not a hyphen: it aligns with the digits in a tabular column.
    expect(formatOre(ore(-8))).toBe('−0,08');
    expect(formatOre(ore(-129_900))).toBe('−1 299,00');
  });

  it('is exact at a magnitude a float would round', () => {
    // The reason §3.2 stores öre: `12999 / 100` is not exactly 129.99, and an
    // implementation that divided first loses the last öre somewhere here.
    expect(formatOre(ore(12_999))).toBe('129,99');
    expect(formatOre(ore(1_000_000_001))).toBe('10 000 000,01');
  });
});

describe('formatOreWithUnit', () => {
  it('appends kronor', () => {
    expect(formatOreWithUnit(ore(297_600))).toBe('2 976,00 kr');
  });
});

describe('formatVatRate', () => {
  it('renders whole percents plainly', () => {
    expect(formatVatRate(2500)).toBe('25 %');
    expect(formatVatRate(600)).toBe('6 %');
    expect(formatVatRate(0)).toBe('0 %');
  });

  it('keeps one decimal where the rate needs it', () => {
    expect(formatVatRate(1225)).toBe('12,3 %');
  });
});

describe('formatQuantity', () => {
  it('renders a decimal quantity with a comma', () => {
    expect(formatQuantity('4.25')).toBe('4,25');
    expect(formatQuantity('0.001')).toBe('0,001');
    expect(formatQuantity('2')).toBe('2');
  });

  it('groups a large quantity and signs a negative one', () => {
    expect(formatQuantity('1234.5')).toBe('1 234,5');
    expect(formatQuantity('-3')).toBe('−3');
  });
});

describe('formatOdometerMil', () => {
  it('converts km to mil and labels it', () => {
    // §3.5: stored in km, displayed in mil, converted only in shared/units.ts.
    expect(formatOdometerMil(120_000)).toBe('12 000,0 mil');
    expect(formatOdometerMil(0)).toBe('0,0 mil');
  });
});

describe('formatDate', () => {
  it('keeps ISO order, which is also Swedish convention', () => {
    expect(formatDate('2026-10-10')).toBe('2026-10-10');
  });
});
