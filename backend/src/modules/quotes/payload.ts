import { ore, sumLines, type LineTotals, type WorkshopDetails } from 'shared';
import { toDecimalString } from '../../lib/dto-decimal.js';
import {
  QUOTE_PAYLOAD_VERSION,
  quotePayloadSchema,
  type QuotePayload,
  type QuotePayloadVatRow,
} from '../../pdf/payload.js';
import {
  computeQuoteLineTotals,
  toStoredTotalsDto,
  type QuoteLineRecord,
  type QuoteRecord,
} from './repository.js';

/**
 * Assembling what a quote PDF is rendered from (PROJECT_SPEC.md §4.2, §8.3).
 *
 * This is the only place a database row turns into a `QuotePayload`. Keeping it
 * apart from the template matters in both directions: the template can be
 * rendered from a fixture with no database at all (which is what makes the
 * golden-file test a test of the template), and a regeneration three years
 * from now reads the stored payload rather than re-running this function
 * against rows that have since changed.
 */

/** The customer as they appear on a document. */
export type PayloadCustomerRecord = {
  readonly name: string;
  readonly orgNumber: string | null;
  readonly address: string | null;
  readonly phone: string;
  readonly email: string | null;
};

export type PayloadVehicleRecord = {
  readonly registrationNumberDisplay: string;
  readonly make: string;
  readonly model: string;
  readonly modelYear: number | null;
  readonly vin: string | null;
};

export type BuildQuotePayloadInput = {
  readonly quote: QuoteRecord;
  readonly lines: readonly QuoteLineRecord[];
  readonly number: string;
  readonly validUntil: string;
  readonly generatedAt: Date;
  readonly workshop: WorkshopDetails;
  readonly customer: PayloadCustomerRecord;
  readonly vehicle: PayloadVehicleRecord;
  readonly workOrder: {
    readonly number: string | null;
    readonly description: string;
  };
};

/**
 * VAT per rate, each row summed from **already-rounded line values** (§3.3).
 *
 * This is §3.3's trap made concrete: the wrong implementation totals each
 * rate's net and then takes 25 % of it, which differs from the sum of the
 * lines' own rounded VAT by an öre or two — and the difference reaches a
 * document the customer is holding. `sumLines` is the shared helper that only
 * ever adds already-rounded values, so the arithmetic cannot be done the other
 * way round here by accident.
 *
 * Rows come out ordered by rate so two renders of one payload cannot differ in
 * row order, which would defeat B0.10.1's byte-identical regeneration for a
 * reason nobody would think to look for.
 */
export function buildVatSummary(
  lines: readonly QuoteLineRecord[],
  lineTotals: readonly LineTotals[],
): QuotePayloadVatRow[] {
  const byRate = new Map<number, LineTotals[]>();

  lines.forEach((line, index) => {
    const totals = lineTotals[index];
    if (totals === undefined) {
      return;
    }
    const bucket = byRate.get(line.vatRateBps);
    if (bucket === undefined) {
      byRate.set(line.vatRateBps, [totals]);
    } else {
      bucket.push(totals);
    }
  });

  return [...byRate.entries()]
    .sort(([a], [b]) => a - b)
    .map(([vatRateBps, totals]) => {
      const summed = sumLines(totals);
      return {
        vatRateBps,
        netOre: summed.netOre,
        vatOre: summed.vatOre,
      };
    });
}

/**
 * Builds the payload and **validates it against its own schema** before it is
 * stored or rendered.
 *
 * Parsing what we just constructed looks redundant and is not: the payload is
 * about to become the authoritative explanation of a document that will
 * outlive this deployment, and a field that quietly went `undefined` — a
 * relation that was not selected, say — would be discovered years later by
 * someone trying to reconstruct it, when nothing can be done. Failing here
 * costs one 500 and a stack trace.
 */
export function buildQuotePayload(input: BuildQuotePayloadInput): QuotePayload {
  const lineTotals = computeQuoteLineTotals(input.lines);

  return quotePayloadSchema.parse({
    payloadVersion: QUOTE_PAYLOAD_VERSION,
    documentType: 'QUOTE',
    generatedAt: input.generatedAt.toISOString(),
    number: input.number,
    validUntil: input.validUntil,
    workshop: input.workshop,
    customer: input.customer,
    vehicle: input.vehicle,
    workOrder: input.workOrder,
    lines: input.lines.map((line, index) => {
      const totals = lineTotals[index];
      return {
        sortOrder: line.sortOrder,
        type: line.type,
        description: line.description,
        quantity: toDecimalString(line.quantity),
        unit: line.unit,
        unitPriceOre: line.unitPriceOre,
        vatRateBps: line.vatRateBps,
        totals: {
          netOre: totals?.netOre ?? ore(0),
          vatOre: totals?.vatOre ?? ore(0),
          grossOre: totals?.grossOre ?? ore(0),
        },
      };
    }),
    vatSummary: buildVatSummary(input.lines, lineTotals),
    // The **stored** totals, not a fresh computation. The document must say
    // what the record says; recomputing here would let a future change to the
    // rounding rules silently reprint an old quote with new numbers.
    totals: toStoredTotalsDto(input.quote),
  });
}
