import { ore } from 'shared';
import { describe, expect, it } from 'vitest';
import { formatCurrency } from './currency';

// Intl.NumberFormat('sv-SE', { style: 'currency' }) uses U+00A0 (no-break
// space) before the unit and U+2212 (minus sign) for negatives — not the
// ASCII lookalikes a hand-typed string would use.
const NBSP = ' ';
const MINUS = '−';

describe('formatCurrency', () => {
  it('formats öre as Swedish kronor', () => {
    expect(formatCurrency(ore(34_950))).toBe(`349,50${NBSP}kr`);
  });

  it('formats a whole-krona amount without decimals dropped', () => {
    expect(formatCurrency(ore(10_000))).toBe(`100,00${NBSP}kr`);
  });

  it('formats zero', () => {
    expect(formatCurrency(ore(0))).toBe(`0,00${NBSP}kr`);
  });

  it('formats a negative amount (credit line) with the Unicode minus sign', () => {
    expect(formatCurrency(ore(-500))).toBe(`${MINUS}5,00${NBSP}kr`);
  });
});
