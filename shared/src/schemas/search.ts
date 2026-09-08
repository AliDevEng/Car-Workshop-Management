import { z } from 'zod';
import { skuSchema, unitSchema } from './article.js';
import {
  idSchema,
  nameSchema,
  normalisedRegistrationNumberSchema,
  phoneSchema,
  searchQuerySchema,
} from './primitives.js';
import { customerTypeSchema } from './customer.js';

/**
 * The one search box in the top bar — PROJECT_SPEC.md §6.3. Staff live in it,
 * so it covers customers, vehicles and articles from a single field.
 */
export const SEARCH_RESULT_TYPES = ['CUSTOMER', 'VEHICLE', 'ARTICLE'] as const;
export type SearchResultType = (typeof SEARCH_RESULT_TYPES)[number];

export const SEARCH_RESULT_TYPE_LABELS: Readonly<
  Record<SearchResultType, string>
> = {
  CUSTOMER: 'Kunder',
  VEHICLE: 'Fordon',
  ARTICLE: 'Artiklar',
};

/**
 * A discriminated union rather than one flat row with optional fields. The
 * frontend renders a different line per kind, and `z.discriminatedUnion` makes
 * the exhaustiveness check in that switch a compile error rather than a blank
 * row nobody notices.
 */
export const searchResultSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('CUSTOMER'),
    id: idSchema,
    name: nameSchema,
    customerType: customerTypeSchema,
    phone: phoneSchema,
  }),
  z.object({
    type: z.literal('VEHICLE'),
    id: idSchema,
    registrationNumber: normalisedRegistrationNumberSchema,
    registrationNumberDisplay: z.string(),
    make: nameSchema,
    model: nameSchema,
    /** Null for a vehicle looked up before anyone knew whose it was (§4.2). */
    customerName: nameSchema.nullable(),
  }),
  z.object({
    type: z.literal('ARTICLE'),
    id: idSchema,
    sku: skuSchema,
    name: nameSchema,
    unit: unitSchema,
  }),
]);
export type SearchResult = z.infer<typeof searchResultSchema>;

/** Capped per category (B3.4.2), so one crowded kind cannot fill the list. */
export const SEARCH_RESULTS_PER_CATEGORY = 10;

export const searchQueryParamsSchema = z.object({
  q: searchQuerySchema,
});
export type SearchQueryParams = z.infer<typeof searchQueryParamsSchema>;

/**
 * Not paginated, and deliberately so: this is a jump-to box, not a report.
 * Anyone who needs more than the capped set is looking for the list page.
 */
export const searchResponseSchema = z.object({
  query: z.string(),
  results: z.array(searchResultSchema),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;
