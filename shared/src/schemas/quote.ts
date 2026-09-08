import { z } from 'zod';
import { cursorQuerySchema } from './common.js';
import {
  documentNumberSchema,
  idSchema,
  isoDateSchema,
  isoDateTimeSchema,
  optionalIdSchema,
  oreSchema,
  timestampFields,
} from './primitives.js';

/**
 * Quotes — PROJECT_SPEC.md §4.2, §6.6.
 *
 * Generated from a work order's lines and editable before sending. On send a
 * `Document` is written and the quote becomes immutable; a change afterwards
 * creates a **new version**, so what the customer received always still
 * exists.
 */
export const QUOTE_STATUSES = [
  'DRAFT',
  'SENT',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_STATUS_LABELS: Readonly<Record<QuoteStatus, string>> = {
  DRAFT: 'Utkast',
  SENT: 'Skickad',
  ACCEPTED: 'Accepterad',
  DECLINED: 'Avböjd',
  EXPIRED: 'Utgången',
};

export const quoteStatusSchema = z.enum(QUOTE_STATUSES);

/**
 * The totals are stored on the quote rather than recomputed on read. They are
 * the sum of already-rounded line values at the moment of sending (§3.3), and
 * a quote the customer has in their hand must not change because a line was
 * edited on the work order afterwards.
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
 * `validUntil` defaults from the `quoteValidityDays` setting when omitted
 * (§4.2's `Setting` list), so the workshop changes its standard validity in
 * one place rather than in every quote.
 */
export const createQuoteInputSchema = z.object({
  workOrderId: idSchema,
  validUntil: isoDateSchema.optional(),
});
export type CreateQuoteInput = z.infer<typeof createQuoteInputSchema>;

/** The customer's answer, recorded by staff — there is no email flow in v1. */
export const respondToQuoteInputSchema = z.object({
  status: z.enum(['ACCEPTED', 'DECLINED']),
});
export type RespondToQuoteInput = z.infer<typeof respondToQuoteInputSchema>;

export const quoteListQuerySchema = cursorQuerySchema.extend({
  status: quoteStatusSchema.optional(),
  workOrderId: idSchema.optional(),
});
export type QuoteListQuery = z.infer<typeof quoteListQuerySchema>;
