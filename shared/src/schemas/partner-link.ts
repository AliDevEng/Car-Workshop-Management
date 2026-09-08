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
export const partnerLinkUrlTemplateSchema = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .startsWith('https://', {
    message: 'Länken måste börja med https://.',
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
