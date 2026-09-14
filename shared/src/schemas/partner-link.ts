import { z } from 'zod';
import {
  idSchema,
  nameSchema,
  sortOrderSchema,
  timestampFields,
} from './primitives.js';

/**
 * Partner deep links — PROJECT_SPEC.md §4.2, §7.2.
 *
 * **No scraping.** Partner webshops' terms prohibit it, their bot protection
 * breaks it unpredictably, and the fitment data behind "fits your car" is a
 * licensed database that is not in the HTML anyway. Links are rows, so a
 * partner's redesign is fixed in thirty seconds without a deploy.
 */
export const PARTNER_LINK_PLACEHOLDER_TYPES = [
  'REGNR',
  'ARTICLE_NUMBER',
  'FREE_TEXT',
] as const;
export type PartnerLinkPlaceholderType =
  (typeof PARTNER_LINK_PLACEHOLDER_TYPES)[number];

export const PARTNER_LINK_PLACEHOLDER_TYPE_LABELS: Readonly<
  Record<PartnerLinkPlaceholderType, string>
> = {
  REGNR: 'Registreringsnummer',
  ARTICLE_NUMBER: 'Artikelnummer',
  FREE_TEXT: 'Fritext',
};

export const partnerLinkPlaceholderTypeSchema = z.enum(
  PARTNER_LINK_PLACEHOLDER_TYPES,
);

/**
 * The tokens a `urlTemplate` may contain. `{regnr_spaced}` exists because some
 * partner sites want `ABC12D` and some want `ABC 12D`; both forms come from
 * `shared/regnr.ts`, and the value is `encodeURIComponent`-escaped at render
 * time.
 */
export const PARTNER_LINK_PLACEHOLDERS = {
  REGNR: '{regnr}',
  REGNR_SPACED: '{regnr_spaced}',
  ARTICLE_NUMBER: '{artnr}',
  FREE_TEXT: '{q}',
} as const;

/**
 * `https` only, and required to carry at least one placeholder. A template
 * with none renders a button that always opens the same page regardless of the
 * car in front of the mechanic, which looks like it works and does not.
 */
/**
 * A template is not a literal URL — it still carries an unencoded `{regnr}`
 * — so a full `new URL()` parse is the wrong check: the global `URL`
 * constructor lives outside `lib: ["ES2023"]` and would need a DOM or Node
 * type this package deliberately does not depend on to stay usable from both
 * consumers. Whitespace is the one thing no valid URL, templated or not, can
 * contain unencoded, and it is exactly what slips past `startsWith` plus the
 * placeholder check on its own.
 */
function hasNoRawWhitespace(value: string): boolean {
  return !/\s/.test(value);
}

export const partnerLinkUrlTemplateSchema = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .startsWith('https://', {
    message: 'Länken måste börja med https://.',
  })
  .refine(hasNoRawWhitespace, {
    message: 'Länken får inte innehålla mellanslag.',
  })
  .refine(
    (template) =>
      Object.values(PARTNER_LINK_PLACEHOLDERS).some((placeholder) =>
        template.includes(placeholder),
      ),
    {
      message:
        'Länken måste innehålla en platshållare, till exempel {regnr} eller {artnr}.',
    },
  );

export const partnerLinkSchema = z.object({
  id: idSchema,
  name: nameSchema,
  urlTemplate: partnerLinkUrlTemplateSchema,
  placeholderType: partnerLinkPlaceholderTypeSchema,
  /** Names an icon the frontend already ships; never a URL to fetch. */
  iconKey: z.string().trim().max(64).nullable(),
  sortOrder: sortOrderSchema,
  isActive: z.boolean(),
  ...timestampFields,
});
export type PartnerLink = z.infer<typeof partnerLinkSchema>;

export const createPartnerLinkInputSchema = z.object({
  name: nameSchema,
  urlTemplate: partnerLinkUrlTemplateSchema,
  placeholderType: partnerLinkPlaceholderTypeSchema,
  iconKey: z.string().trim().max(64).optional(),
  sortOrder: sortOrderSchema.optional(),
});
export type CreatePartnerLinkInput = z.infer<
  typeof createPartnerLinkInputSchema
>;

export const updatePartnerLinkInputSchema = createPartnerLinkInputSchema
  .partial()
  .extend({ isActive: z.boolean().optional() });
export type UpdatePartnerLinkInput = z.infer<
  typeof updatePartnerLinkInputSchema
>;

export const partnerLinkIdParamsSchema = z.object({ id: idSchema });
export type PartnerLinkIdParams = z.infer<typeof partnerLinkIdParamsSchema>;

export const partnerLinkResponseSchema = z.object({ link: partnerLinkSchema });
export type PartnerLinkResponse = z.infer<typeof partnerLinkResponseSchema>;

/**
 * `GET /api/partner-links` (B10.6.2). Not paginated: the list is a handful of
 * rows an admin drags into order on one screen, and a partial page of a
 * reorderable list is not a meaningful thing to render.
 */
export const partnerLinkListQuerySchema = z.object({
  isActive: z.stringbool().optional(),
});
export type PartnerLinkListQuery = z.infer<typeof partnerLinkListQuerySchema>;

export const partnerLinkListResponseSchema = z.object({
  data: z.array(partnerLinkSchema),
});
export type PartnerLinkListResponse = z.infer<
  typeof partnerLinkListResponseSchema
>;

/**
 * `POST /api/partner-links/reorder` (B10.6.2). The full set of ids in their
 * new order — the service checks it against the existing rows exactly, so a
 * link cannot be dropped or duplicated by a stale client.
 */
export const reorderPartnerLinksInputSchema = z.object({
  orderedIds: z.array(idSchema).min(1),
});
export type ReorderPartnerLinksInput = z.infer<
  typeof reorderPartnerLinksInputSchema
>;
