import { z } from 'zod';
import { QUOTE_STATUSES } from '../quote-state.js';
import { cursorQuerySchema, paginatedResponseSchema } from './common.js';
import { customerSummarySchema } from './customer.js';
import {
  documentNumberSchema,
  documentTotalsSchema,
  idSchema,
  isoDateSchema,
  isoDateTimeSchema,
  lineTotalsSchema,
  optionalIdSchema,
  oreSchema,
  quantityStringSchema,
  shortTextSchema,
  sortOrderSchema,
  timestampFields,
  vatRateBpsSchema,
} from './primitives.js';
import { unitSchema } from './article.js';
import { vehicleSummarySchema } from './vehicle.js';
import { workOrderLineTypeSchema } from './work-order.js';

/**
 * Quotes — PROJECT_SPEC.md §4.2, §6.6.
 *
 * Generated from a work order's lines and editable before sending. On send a
 * `Document` is written and the quote becomes immutable; a change afterwards
 * creates a **new version**, so what the customer received always still
 * exists.
 *
 * The status enum comes from `shared/quote-state.ts`, which also owns the
 * transition table — one list, one state machine, exactly as work orders do.
 * It is imported rather than re-exported here: the barrel already exports the
 * state module, and a name reachable through two star-exports is the ambiguous
 * binding ESM resolves to nothing.
 */
export const quoteStatusSchema = z.enum(QUOTE_STATUSES);

/**
 * A line **as it stood when the quote was created**, copied out of the work
 * order rather than referenced (B7.3.2).
 *
 * The work order's own lines go on changing — that is what a work order is for
 * — and §6.6 requires that what the customer received always still exists. A
 * quote that read its lines back from the order would silently rewrite itself
 * the next time a mechanic added a part, which is the same failure §4.2's
 * article snapshot exists to prevent, one level up.
 */
export const quoteLineSchema = z.object({
  id: idSchema,
  quoteId: idSchema,
  sortOrder: sortOrderSchema,
  type: workOrderLineTypeSchema,
  /** Traceability only. Never joined for display (§4.2). */
  articleId: optionalIdSchema,
  description: shortTextSchema,
  quantity: quantityStringSchema,
  unit: unitSchema,
  unitPriceOre: oreSchema,
  vatRateBps: vatRateBpsSchema,
  /** Computed from the fields above, in the §3.3 order. */
  totals: lineTotalsSchema,
});
export type QuoteLine = z.infer<typeof quoteLineSchema>;

/**
 * The totals are **stored** on the quote rather than recomputed on read, which
 * is the one place this codebase deliberately departs from B6's "compute on
 * read" rule. A work order's lines change until it is completed, so a stored
 * total there would drift; a quote's lines are frozen at creation, and the
 * numbers the customer was given must survive a later change to how totals are
 * calculated. They are summed from already-rounded line values (§3.3).
 */
export const quoteSchema = z.object({
  id: idSchema,
  workOrderId: idSchema,
  /**
   * `OF-2026-0001`, and **null while the quote is a `DRAFT`**. The number and
   * the `Document` are both written on send (§6.6), because §4.4 assigns a
   * number on finalisation so that abandoned drafts leave no gaps.
   */
  number: documentNumberSchema.nullable(),
  /**
   * Which version of this work order's quote this is, counting from 1 (§6.6,
   * B7.5). A revision of a sent quote is a new row with the next revision,
   * pointing back at the one it replaces — the customer's copy is never edited.
   */
  revision: z.number().int().min(1),
  /** The sent quote this one supersedes, if it is a revision (B7.5.1). */
  supersedesQuoteId: optionalIdSchema,
  status: quoteStatusSchema,
  validUntil: isoDateSchema,
  netOre: oreSchema,
  vatOre: oreSchema,
  grossOre: oreSchema,
  /** Display-only öresavrundning. Never fed back into line values (§3.3). */
  roundingOre: oreSchema,
  documentId: optionalIdSchema,
  sentAt: isoDateTimeSchema.nullable(),
  respondedAt: isoDateTimeSchema.nullable(),
  ...timestampFields,
});
export type Quote = z.infer<typeof quoteSchema>;

/**
 * `roundedGrossOre` is derived rather than stored: it is `grossOre +
 * roundingOre`, and storing an addition is how a document and a screen end up
 * one öre apart. The four stored fields are the record; this is the view.
 */
export const quoteDetailSchema = quoteSchema.extend({
  customer: customerSummarySchema,
  vehicle: vehicleSummarySchema,
  workOrderNumber: documentNumberSchema.nullable(),
  lines: z.array(quoteLineSchema),
  totals: documentTotalsSchema,
});
export type QuoteDetail = z.infer<typeof quoteDetailSchema>;

/** A row of the quote list, and of the version list on a work order (B7.5.2). */
export const quoteListItemSchema = quoteSchema.extend({
  customer: customerSummarySchema,
  vehicle: vehicleSummarySchema,
  lineCount: z.number().int().min(0),
  totals: documentTotalsSchema,
});
export type QuoteListItem = z.infer<typeof quoteListItemSchema>;

export const quoteListResponseSchema =
  paginatedResponseSchema(quoteListItemSchema);
export type QuoteListResponse = z.infer<typeof quoteListResponseSchema>;

/**
 * `validUntil` defaults from the `quoteValidityDays` setting when omitted
 * (§4.2's `Setting` list), so the workshop changes its standard validity in
 * one place rather than in every quote. The work order is the path parameter,
 * not a body field: the lines being snapshotted are its.
 */
export const createQuoteInputSchema = z.object({
  validUntil: isoDateSchema.optional(),
});
export type CreateQuoteInput = z.infer<typeof createQuoteInputSchema>;

/**
 * The only editable field, and only while the quote is a `DRAFT` (B7.5.1).
 *
 * The lines are deliberately not editable here: they are a snapshot of the
 * work order, and the way to change them is to change the work order and take
 * a fresh quote. Editing the copy would leave two answers to "what was
 * quoted", which is the drift the snapshot exists to prevent.
 */
export const updateQuoteInputSchema = z.object({
  validUntil: isoDateSchema,
});
export type UpdateQuoteInput = z.infer<typeof updateQuoteInputSchema>;

/** The customer's answer, recorded by staff — there is no email flow in v1. */
export const respondToQuoteInputSchema = z.object({
  status: z.enum(['ACCEPTED', 'DECLINED']),
});
export type RespondToQuoteInput = z.infer<typeof respondToQuoteInputSchema>;

/**
 * Sending renders the PDF, writes the `Document`, spends the §4.4 number and
 * freezes the quote. It carries no body: everything it needs is already on the
 * record, and a field here would be a way to change a quote at the moment it
 * stops being changeable.
 */
export const quoteResponseSchema = z.object({ quote: quoteDetailSchema });
export type QuoteResponse = z.infer<typeof quoteResponseSchema>;

export const quoteListQuerySchema = cursorQuerySchema.extend({
  status: quoteStatusSchema.optional(),
  workOrderId: idSchema.optional(),
});
export type QuoteListQuery = z.infer<typeof quoteListQuerySchema>;

export const quoteIdParamsSchema = z.object({ id: idSchema });
export type QuoteIdParams = z.infer<typeof quoteIdParamsSchema>;
