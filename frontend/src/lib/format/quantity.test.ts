import { parseQuantity } from 'shared';
import { describe, expect, it } from 'vitest';
import { formatSignedQuantity } from './quantity';

describe('formatSignedQuantity', () => {
  it('prefixes a positive quantity with +', () => {
    expect(formatSignedQuantity(parseQuantity('2.5'))).toBe('+2,5');
  });

  it('keeps the - sign on a negative quantity', () => {
    expect(formatSignedQuantity(parseQuantity('-1.25'))).toBe('-1,25');
  });

  it('does not prefix zero', () => {
    expect(formatSignedQuantity(parseQuantity('0'))).toBe('0');
  });
});
