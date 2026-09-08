import { z } from 'zod';
import { cursorQuerySchema } from './common.js';
import {
  booleanQuerySchema,
  emailSchema,
  idSchema,
  isoDateTimeSchema,
  nameSchema,
  noteSchema,
  orgNumberSchema,
  phoneSchema,
  searchQuerySchema,
  shortTextSchema,
  timestampFields,
} from './primitives.js';

/**
 * Customers — PROJECT_SPEC.md §4.2. Phone is the required contact channel and
 * email is optional, because a real workshop's customer list is half
 * phone-only.
 */
export const CUSTOMER_TYPES = ['PRIVATE', 'COMPANY'] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const CUSTOMER_TYPE_LABELS: Readonly<Record<CustomerType, string>> = {
  PRIVATE: 'Privatperson',
  COMPANY: 'Företag',
};

export const customerTypeSchema = z.enum(CUSTOMER_TYPES);

export const customerSchema = z.object({
  id: idSchema,
  type: customerTypeSchema,
  name: nameSchema,
  orgNumber: orgNumberSchema.nullable(),
  email: emailSchema.nullable(),
  /** Exactly what the customer gave — `070-123 45 67` (§8.2). */
  phone: phoneSchema,
  /**
   * The same number in E.164. Both columns are stored and both are indexed:
   * searching only the normalised one breaks the moment someone types
   * `070-123`, and searching only the entered one breaks for a number written
   * a different way last year (§8.2).
   */
  phoneNormalised: z.string(),
  address: shortTextSchema.nullable(),
  notes: noteSchema.nullable(),
  /**
   * Set when a GDPR erasure request is honoured. The customer is anonymised,
   * never hard-deleted — the documents they appear on must survive (§5.5).
   */
  anonymisedAt: isoDateTimeSchema.nullable(),
  isActive: z.boolean(),
  ...timestampFields,
});
export type Customer = z.infer<typeof customerSchema>;

/** Enough to label a work order, a booking or a search hit. */
export const customerSummarySchema = z.object({
  id: idSchema,
  type: customerTypeSchema,
  name: nameSchema,
  phone: phoneSchema,
});
export type CustomerSummary = z.infer<typeof customerSummarySchema>;

/**
 * `phoneNormalised` is absent on purpose: it is derived from `phone` by the
 * service, and accepting it from the client would let the two columns disagree
 * — which is exactly the failure §8.2 exists to prevent.
 */
export const createCustomerInputSchema = z.object({
  type: customerTypeSchema,
  name: nameSchema,
  orgNumber: orgNumberSchema.optional(),
  email: emailSchema.optional(),
  phone: phoneSchema,
  address: shortTextSchema.optional(),
  notes: noteSchema.optional(),
});
export type CreateCustomerInput = z.infer<typeof createCustomerInputSchema>;

export const updateCustomerInputSchema = createCustomerInputSchema.partial();
export type UpdateCustomerInput = z.infer<typeof updateCustomerInputSchema>;

export const customerListQuerySchema = cursorQuerySchema.extend({
  /** Matches name, either phone column, and email (§8.2, B3.1.2). */
  q: searchQuerySchema.optional(),
  isActive: booleanQuerySchema.optional(),
});
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
