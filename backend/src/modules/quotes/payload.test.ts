import { describe, expect, it } from 'vitest';
import { calculateLine, ore, parseDecimal, type LineTotals } from 'shared';
import { Prisma } from '../../generated/prisma/client.js';
import { buildVatSummary } from './payload.js';
import type { QuoteLineRecord } from './repository.js';

/**
 * B7.4.1 — the VAT summary, which is where §3.3's trap lives.
 *
 * "Summing VAT from document totals instead of from rounded lines" is the
 * first row of CLAUDE.md's trap table, and a per-rate summary is exactly the
 * place a developer reaches for `net × rate` instead. Tested directly rather
 * than only through a rendered PDF, because the difference is an öre and an
 * öre is invisible in a screenshot.
 */

function line(
  overrides: Partial<QuoteLineRecord> & { vatRateBps: number },
): QuoteLineRecord {
  return {
    id: `line-${String(overrides.sortOrder ?? 0)}`,
    quoteId: 'quote',
    sortOrder: 0,
    type: 'PART',
    articleId: null,
    description: 'Rad',
    quantity: new Prisma.Decimal('1'),
    unit: 'PIECE',
    unitPriceOre: 10_000,
    ...overrides,
  };
}

function totalsFor(record: QuoteLineRecord): LineTotals {
  return calculateLine({
    unitPriceOre: ore(record.unitPriceOre),
    quantity: parseDecimal(record.quantity.toFixed()),
    vatRateBps: record.vatRateBps,
  });
}

function summarise(records: readonly QuoteLineRecord[]) {
  return buildVatSummary(records, records.map(totalsFor));
}

describe('buildVatSummary', () => {
  it('groups lines by their own VAT rate', () => {
    const rows = summarise([
      line({ sortOrder: 0, vatRateBps: 2500, unitPriceOre: 10_000 }),
      line({ sortOrder: 1, vatRateBps: 600, unitPriceOre: 5000 }),
      line({ sortOrder: 2, vatRateBps: 2500, unitPriceOre: 20_000 }),
    ]);

    expect(rows).toEqual([
      { vatRateBps: 600, netOre: 5000, vatOre: 300 },
      { vatRateBps: 2500, netOre: 30_000, vatOre: 7500 },
    ]);
  });

  it('orders rows by rate, so two renders cannot differ in row order', () => {
    // Insertion order would be a hidden input to the bytes, which would defeat
    // B0.10.1's byte-identical regeneration for a reason nobody would look for.
    const ascending = summarise([
      line({ sortOrder: 0, vatRateBps: 600 }),
      line({ sortOrder: 1, vatRateBps: 2500 }),
    ]);
    const descending = summarise([
      line({ sortOrder: 0, vatRateBps: 2500 }),
      line({ sortOrder: 1, vatRateBps: 600 }),
    ]);

    expect(ascending.map((row) => row.vatRateBps)).toEqual([600, 2500]);
    expect(descending.map((row) => row.vatRateBps)).toEqual([600, 2500]);
  });

  it('sums already-rounded line VAT, not VAT recomputed from the net', () => {
    // §3.3 made visible. Thirty-three lines of 33,33 kr at 25 %: each line
    // rounds to 833 öre of VAT, summing to 27 489. Taking 25 % of the summed
    // net (109 989) gives 27 497 — eight öre adrift, on a document a customer
    // is holding.
    const records = Array.from({ length: 33 }, (_unused, index) =>
      line({ sortOrder: index, vatRateBps: 2500, unitPriceOre: 3333 }),
    );

    const rows = summarise(records);
    const row = rows[0];

    expect(rows).toHaveLength(1);
    expect(row?.netOre).toBe(109_989);
    expect(row?.vatOre).toBe(27_489);
    expect(row?.vatOre).not.toBe(Math.round(109_989 * 0.25));
  });

  it('keeps a zero-rated group rather than dropping it', () => {
    const rows = summarise([
      line({ sortOrder: 0, vatRateBps: 0, unitPriceOre: 7500 }),
      line({ sortOrder: 1, vatRateBps: 2500, unitPriceOre: 7500 }),
    ]);

    expect(rows).toEqual([
      { vatRateBps: 0, netOre: 7500, vatOre: 0 },
      { vatRateBps: 2500, netOre: 7500, vatOre: 1875 },
    ]);
  });

  it('returns nothing for no lines', () => {
    expect(summarise([])).toEqual([]);
  });

  it('adds up to the document total across every rate', () => {
    // The property that actually matters: the summary and the totals beside it
    // must be the same arithmetic, or the document disagrees with itself.
    const records = [
      line({ sortOrder: 0, vatRateBps: 2500, unitPriceOre: 89_500 }),
      line({ sortOrder: 1, vatRateBps: 600, unitPriceOre: 4500 }),
      line({ sortOrder: 2, vatRateBps: 2500, unitPriceOre: 12_999 }),
    ];
    const rows = summarise(records);
    const lineTotals = records.map(totalsFor);

    expect(rows.reduce((sum, row) => sum + row.netOre, 0)).toBe(
      lineTotals.reduce((sum, totals) => sum + totals.netOre, 0),
    );
    expect(rows.reduce((sum, row) => sum + row.vatOre, 0)).toBe(
      lineTotals.reduce((sum, totals) => sum + totals.vatOre, 0),
    );
  });
});
