import {
  calculateLine,
  calculateOresRounding,
  sumLines,
  type LineInput,
  type LineTotals,
  type Ore,
} from './money.js';

/**
 * Work-order and document totals — PROJECT_SPEC.md §3.3, §6.5 (B6.3).
 *
 * Totals are **computed on read** rather than stored: a work order's lines
 * change until it is completed, and a stored total is a second source of truth
 * that drifts the first time one is written and the other is not. Only a
 * finalised document (a quote in B7, a protocol in B8) freezes its numbers,
 * and it freezes them by copying the result of this function.
 */

/** A document's totals: the line sums plus the display-only öresavrundning. */
export interface DocumentTotals extends LineTotals {
  /** `roundedGrossOre − grossOre`. Display-only; never fed back into a line. */
  readonly roundingOre: Ore;
  readonly roundedGrossOre: Ore;
}

/**
 * The per-line values **and** the document totals, from one computation.
 *
 * Returning both together is the point. §3.3's trap is summing VAT from a
 * document total instead of from the already-rounded lines, and the way that
 * happens in practice is two call sites: one rounding the lines for display,
 * another recomputing the total from the raw inputs. They differ by öre, and
 * the difference reaches a printed document. Here the totals are summed from
 * exactly the values the client is shown, because they are the same array.
 */
export interface WorkOrderTotals {
  readonly lines: readonly LineTotals[];
  readonly totals: DocumentTotals;
}

export function calculateWorkOrderTotals(
  lines: readonly LineInput[],
): WorkOrderTotals {
  // Each line rounded first (§3.3: net, then VAT from the rounded net, then
  // gross), then summed from those rounded values — never recomputed.
  const lineTotals = lines.map((line) => calculateLine(line));
  const summed = sumLines(lineTotals);
  const rounding = calculateOresRounding(summed.grossOre);

  return {
    lines: lineTotals,
    totals: {
      ...summed,
      roundingOre: rounding.roundingOre,
      roundedGrossOre: rounding.roundedOre,
    },
  };
}
