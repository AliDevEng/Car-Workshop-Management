import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { calculateLine, ore, sumLines, type LineInput } from '../src/money.js';
import { calculateWorkOrderTotals } from '../src/work-order-totals.js';

/**
 * B6.3 — work-order totals.
 *
 * §3.3's rule is an ordering rule, and the bug it exists to prevent is worth
 * one öre on a document a customer is holding: **sum already-rounded line
 * values; never recompute VAT from a document total.** Every assertion below
 * is written out by hand rather than derived from the implementation, because
 * an expectation derived from the code only asserts that the code equals
 * itself.
 */

function line(
  unitPriceOre: number,
  quantity: string,
  vatRateBps: number,
): LineInput {
  return {
    unitPriceOre: ore(unitPriceOre),
    quantity: new Decimal(quantity),
    vatRateBps,
  };
}

describe('calculateWorkOrderTotals', () => {
  it('answers with zeros for an order with no lines', () => {
    // A draft with no lines is the normal starting state, and it must render
    // rather than divide by nothing.
    expect(calculateWorkOrderTotals([]).totals).toEqual({
      netOre: 0,
      vatOre: 0,
      grossOre: 0,
      roundingOre: 0,
      roundedGrossOre: 0,
    });
  });

  it('rounds a line net first, then takes VAT from the rounded net (§3.3)', () => {
    // 129,99 kr × 2,5 = 324,975 kr → 32 498 öre, and 25 % of *that* is
    // 8 124,5 → 8 125. Taking 25 % of the unrounded 32 497,5 gives 8 124,375
    // → 8 124, which is one öre out and would make the line's own three
    // numbers disagree with each other.
    const [result] = calculateWorkOrderTotals([
      line(12_999, '2.5', 2500),
    ]).lines;

    expect(result).toEqual({ netOre: 32_498, vatOre: 8125, grossOre: 40_623 });
  });

  it('sums 30 mixed lines to hand-calculated totals (B6.3.3)', () => {
    const lines: LineInput[] = [
      // 10 × labour, 895,00 kr/h at 25 %.
      ...Array.from({ length: 10 }, () => line(89_500, '1', 2500)),
      // 10 × a part, 129,99 kr, 2,5 units at 25 %.
      ...Array.from({ length: 10 }, () => line(12_999, '2.5', 2500)),
      // 10 × a VAT-free fee, 49,00 kr.
      ...Array.from({ length: 10 }, () => line(4900, '1', 0)),
    ];

    const { totals } = calculateWorkOrderTotals(lines);

    // net: 10 × 89 500 + 10 × 32 498 + 10 × 4 900 = 1 268 980
    // vat: 10 × 22 375 + 10 ×  8 125 + 10 ×     0 =   305 000
    // gross:                       1 268 980 + 305 000 = 1 573 980
    // öresavrundning: 15 739,80 kr → 15 740,00 kr, a difference of 20 öre.
    expect(totals).toEqual({
      netOre: 1_268_980,
      vatOre: 305_000,
      grossOre: 1_573_980,
      roundingOre: 20,
      roundedGrossOre: 1_574_000,
    });
  });

  it('returns per-line totals that sum to exactly the document totals', () => {
    // The invariant the whole function exists for. If these two ever differ,
    // a screen and the document printed from it differ, and the öre lands on
    // a customer's receipt.
    const lines = Array.from({ length: 33 }, () => line(3333, '1', 2500));
    const { lines: perLine, totals } = calculateWorkOrderTotals(lines);

    const summed = sumLines(perLine);
    expect(summed.netOre).toBe(totals.netOre);
    expect(summed.vatOre).toBe(totals.vatOre);
    expect(summed.grossOre).toBe(totals.grossOre);
  });

  it('differs from recomputing VAT off the document net — that is the bug', () => {
    // 33 lines of 33,33 kr: each line's VAT is 833 öre (833,25 rounded down),
    // so the document's VAT is 27 489. Recomputing 25 % of the summed net
    // 109 989 gives 27 497 — eight öre the lines cannot account for.
    const lines = Array.from({ length: 33 }, () => line(3333, '1', 2500));
    const { totals } = calculateWorkOrderTotals(lines);

    expect(totals.netOre).toBe(109_989);
    expect(totals.vatOre).toBe(27_489);
    expect(totals.vatOre).not.toBe(27_497);
  });

  it('handles a credited line without turning the rounding the wrong way', () => {
    // A negative line is legitimate (§3.2 keeps öre signed), and
    // öresavrundning is half **away from zero** — so −0,50 kr rounds to
    // −1,00 kr, not towards it.
    const { totals } = calculateWorkOrderTotals([line(-40, '1', 2500)]);

    expect(totals.grossOre).toBe(-50);
    expect(totals.roundedGrossOre).toBe(-100);
    expect(totals.roundingOre).toBe(-50);
  });

  it('leaves a whole-krona total alone', () => {
    const { totals } = calculateWorkOrderTotals([line(8000, '1', 2500)]);

    expect(totals.grossOre).toBe(10_000);
    expect(totals.roundingOre).toBe(0);
    expect(totals.roundedGrossOre).toBe(10_000);
  });

  it('agrees line for line with calculateLine, which is what B1.1 owns', () => {
    const inputs = [line(12_999, '2.5', 2500), line(4900, '1', 0)];
    const { lines } = calculateWorkOrderTotals(inputs);

    expect(lines).toEqual(inputs.map((input) => calculateLine(input)));
  });
});
