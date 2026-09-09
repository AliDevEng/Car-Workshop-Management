import { describe, expect, it } from 'vitest';
import type { LowStockArticle } from 'shared';
import { toLowStockCsv } from './low-stock-csv.js';

/**
 * B4.5.2/B4.5.3 — the low-stock purchase list as CSV.
 *
 * The BOM is the load-bearing detail (Excel reads å/ä/ö correctly with it,
 * boxes without it), so it is asserted directly, and the pure function is
 * tested without the HTTP layer.
 */

function article(overrides: Partial<LowStockArticle> = {}): LowStockArticle {
  return {
    id: 'a1',
    sku: 'OLJA-5W30-1L',
    name: 'Motorolja 5W-30',
    unit: 'LITRE',
    salesPriceOre: 12_900,
    vatRateBps: 2500,
    stockQuantity: '3',
    minimumQuantity: '20',
    location: 'A1-03',
    ...overrides,
  };
}

describe('toLowStockCsv', () => {
  it('starts with a UTF-8 BOM', () => {
    const csv = toLowStockCsv([]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('has a header row even with no articles', () => {
    const csv = toLowStockCsv([]).replace('\uFEFF', '');
    expect(csv.trimEnd()).toBe(
      'Artikelnummer;Namn;Enhet;Hylla;Lagersaldo;Miniminivå;Underskott;Försäljningspris (kr)',
    );
  });

  it('writes the unit label, Swedish decimals and the deficit', () => {
    const csv = toLowStockCsv([
      article({
        stockQuantity: '3.5',
        minimumQuantity: '20',
        salesPriceOre: 12_900,
      }),
    ]);
    const row = csv.trimEnd().split('\r\n').at(-1);
    // deficit = 20 - 3.5 = 16.5; price = 129,00 kr
    expect(row).toBe('OLJA-5W30-1L;Motorolja 5W-30;l;A1-03;3,5;20;16,5;129,00');
  });

  it('quotes a field that contains the separator', () => {
    const csv = toLowStockCsv([
      article({ name: 'Olja; syntet', location: null }),
    ]);
    expect(csv).toContain('"Olja; syntet"');
    // A null shelf becomes an empty field, not the string "null".
    expect(csv).toContain(';;');
  });

  it('escapes an embedded quote by doubling it', () => {
    const csv = toLowStockCsv([article({ name: 'Filter 1/2"' })]);
    expect(csv).toContain('"Filter 1/2"""');
  });

  it('separates rows with CRLF and ends the file with one', () => {
    const csv = toLowStockCsv([article(), article({ sku: 'FILTER-1' })]);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv.replace('\uFEFF', '').split('\r\n')).toHaveLength(4); // header + 2 + trailing ''
  });
});
