import { z } from 'zod';
import {
  documentNumberSchema,
  documentTotalsSchema,
  isoDateSchema,
  isoDateTimeSchema,
  lineTotalsSchema,
  quantityStringSchema,
  unitSchema,
  vatRateBpsSchema,
  workOrderLineTypeSchema,
  workshopDetailsSchema,
} from 'shared';

/**
 * What a quote PDF was rendered from (PROJECT_SPEC.md §4.2, §8.3; B7.4.4).
 *
 * §4.2: "`payloadJson` stores the exact data the PDF was rendered from, so that
 * three years later the document's content can be reconstructed and explained
 * even if the template has changed since."
 *
 * ## Why this lives in the backend and not in `shared`
 *
 * CLAUDE.md puts every API contract in `shared/`, and `shared/schemas/document.ts`
 * follows that rule by typing `payloadJson` as `z.unknown()` — deliberately,
 * because pinning a shape there would make a three-year-old document fail to
 * parse the day its template changed. This schema is the *renderer's* private
 * contract with itself: the template that produced version 1 and the code that
 * reads version 1 back are both here, and neither is the client's business.
 *
 * ## The version field is the whole mechanism
 *
 * `payloadVersion` is not decoration. When B8's template gains a field, this
 * schema gains a version, and the reader dispatches on it — an old document is
 * re-read by the code that understands it rather than being coerced into the
 * new shape and quietly losing a line. Widening this schema in place, without
 * a version, is the failure §4.2 keeps the column to avoid.
 */

export const QUOTE_PAYLOAD_VERSION = 1;

/**
 * The customer as they were **at the moment of sending**, copied rather than
 * referenced — the same snapshot rule §4.2 applies to a work-order line.
 *
 * It is also what makes §5.5 work: a customer anonymised on a GDPR request
 * keeps their documents, and those documents keep the name that was on them.
 * Reading the live customer row at render time would rewrite a three-year-old
 * offert to say "Anonymiserad kund".
 */
const payloadCustomerSchema = z.object({
  name: z.string(),
  orgNumber: z.string().nullable(),
  address: z.string().nullable(),
  phone: z.string(),
  email: z.string().nullable(),
});

const payloadVehicleSchema = z.object({
  registrationNumberDisplay: z.string(),
  make: z.string(),
  model: z.string(),
  modelYear: z.number().int().nullable(),
  vin: z.string().nullable(),
});

const payloadLineSchema = z.object({
  sortOrder: z.number().int().min(0),
  type: workOrderLineTypeSchema,
  description: z.string(),
  quantity: quantityStringSchema,
  unit: unitSchema,
  unitPriceOre: z.number().int(),
  vatRateBps: vatRateBpsSchema,
  totals: lineTotalsSchema,
});
export type QuotePayloadLine = z.infer<typeof payloadLineSchema>;

/**
 * VAT per rate, each row summed from **already-rounded line values** (§3.3).
 *
 * A single VAT figure is not enough on a Swedish document once two rates
 * appear on one job, and recomputing a rate's VAT from that rate's net total is
 * the öre-level bug §3.3 names. These rows are grouped sums of the line values
 * above, which is why they are stored rather than derived at render time.
 */
const payloadVatSummaryRowSchema = z.object({
  vatRateBps: vatRateBpsSchema,
  netOre: z.number().int(),
  vatOre: z.number().int(),
});
export type QuotePayloadVatRow = z.infer<typeof payloadVatSummaryRowSchema>;

export const quotePayloadSchema = z.object({
  payloadVersion: z.literal(QUOTE_PAYLOAD_VERSION),
  documentType: z.literal('QUOTE'),
  /**
   * Also the PDF's pinned creation and modification date (B7.4.4). B0.10.1
   * established that this pin is what makes a re-render byte-identical.
   */
  generatedAt: isoDateTimeSchema,
  number: documentNumberSchema,
  validUntil: isoDateSchema,
  workshop: workshopDetailsSchema,
  customer: payloadCustomerSchema,
  vehicle: payloadVehicleSchema,
  workOrder: z.object({
    number: documentNumberSchema.nullable(),
    description: z.string(),
  }),
  lines: z.array(payloadLineSchema),
  vatSummary: z.array(payloadVatSummaryRowSchema),
  totals: documentTotalsSchema,
});
export type QuotePayload = z.infer<typeof quotePayloadSchema>;

/**
 * Reads a stored payload back, for a regeneration or an integrity check.
 *
 * A schema rather than a cast: the row was written by an earlier deployment
 * and its shape is a claim until something checks it (CLAUDE.md — data
 * crossing a boundary enters as `unknown`). A `Json` column is exactly such a
 * boundary, even though both ends are ours.
 */
export function parseQuotePayload(value: unknown): QuotePayload {
  return quotePayloadSchema.parse(value);
}
