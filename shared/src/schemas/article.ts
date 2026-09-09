import { z } from 'zod';
import { UNITS } from '../units.js';
import { cursorQuerySchema } from './common.js';
import {
  booleanQuerySchema,
  idSchema,
  nameSchema,
  noteSchema,
  nonNegativeOreSchema,
  quantityStringSchema,
  searchQuerySchema,
  shortTextSchema,
  timestampFields,
  vatRateBpsSchema,
  VAT_RATE_BPS_STANDARD,
} from './primitives.js';

/**
 * The article catalogue — PROJECT_SPEC.md §4.2 and §6.4.
 *
 * `UNITS` is imported from `shared/units.ts` rather than redeclared: one list,
 * used by the quantity helpers and by this contract, so a unit added in one
 * place cannot go missing in the other.
 */
export const unitSchema = z.enum(UNITS);
export type UnitValue = z.infer<typeof unitSchema>;

export const UNIT_LABELS: Readonly<Record<UnitValue, string>> = {
  PIECE: 'st',
  LITRE: 'l',
  HOUR: 'tim',
  KIT: 'sats',
};

export const skuSchema = z
  .string()
  .trim()
  .min(1, { message: 'Artikelnumret får inte vara tomt.' })
  .max(64, { message: 'Artikelnumret är för långt.' });

/**
 * An OE number as printed on the part. Uppercased and stripped of spaces by
 * the service so that the partner deep links in §7.2 substitute a value the
 * wholesaler's search actually recognises.
 */
export const oeNumberSchema = z.string().trim().min(1).max(64);

export const articleSchema = z.object({
  id: idSchema,
  sku: skuSchema,
  name: nameSchema,
  description: noteSchema.nullable(),
  unit: unitSchema,
  /** Excluding VAT, in integer öre (§3.2, §3.3). */
  salesPriceOre: nonNegativeOreSchema,
  purchasePriceOre: nonNegativeOreSchema.nullable(),
  vatRateBps: vatRateBpsSchema,
  /**
   * A **cache** of the stock ledger, not the truth. `StockMovement` is the
   * record; this column exists so reading a balance is one cheap column read
   * (§4.2). A nightly job re-derives it and logs any drift.
   */
  stockQuantity: quantityStringSchema,
  minimumQuantity: quantityStringSchema,
  /** Shelf location. */
  location: shortTextSchema.nullable(),
  /** What makes the partner-link buttons useful (§7.2). */
  oeNumbers: z.array(oeNumberSchema),
  isActive: z.boolean(),
  ...timestampFields,
});
export type Article = z.infer<typeof articleSchema>;

/** Enough to snapshot onto a work order line or render a search hit. */
export const articleSummarySchema = z.object({
  id: idSchema,
  sku: skuSchema,
  name: nameSchema,
  unit: unitSchema,
  salesPriceOre: nonNegativeOreSchema,
  vatRateBps: vatRateBpsSchema,
});
export type ArticleSummary = z.infer<typeof articleSummarySchema>;

/**
 * `stockQuantity` is absent by design. Stock only ever moves through
 * `recordMovement`, which writes a ledger row and updates the cache in one
 * transaction with the article row locked (§4.2). A settable balance field
 * would be a second, unaudited way to change it.
 */
export const createArticleInputSchema = z.object({
  sku: skuSchema,
  name: nameSchema,
  description: noteSchema.optional(),
  unit: unitSchema,
  salesPriceOre: nonNegativeOreSchema,
  purchasePriceOre: nonNegativeOreSchema.optional(),
  vatRateBps: vatRateBpsSchema.default(VAT_RATE_BPS_STANDARD),
  minimumQuantity: quantityStringSchema.default('0'),
  location: shortTextSchema.optional(),
  oeNumbers: z.array(oeNumberSchema).default([]),
});
export type CreateArticleInput = z.infer<typeof createArticleInputSchema>;

export const updateArticleInputSchema = createArticleInputSchema.partial();
export type UpdateArticleInput = z.infer<typeof updateArticleInputSchema>;

export const articleListQuerySchema = cursorQuerySchema.extend({
  /** Matches SKU, name and OE numbers (§6.3, B4.1.2). */
  q: searchQuerySchema.optional(),
  /** Only articles whose cached balance is below `minimumQuantity` (§6.4). */
  lowStock: booleanQuerySchema.optional(),
  isActive: booleanQuerySchema.optional(),
});
export type ArticleListQuery = z.infer<typeof articleListQuerySchema>;

/** A row of the purchase list the low-stock view exports (B4.5). */
export const lowStockArticleSchema = articleSummarySchema.extend({
  stockQuantity: quantityStringSchema,
  minimumQuantity: quantityStringSchema,
  location: shortTextSchema.nullable(),
});
export type LowStockArticle = z.infer<typeof lowStockArticleSchema>;

/**
 * `GET /api/articles/low-stock` — a focused report ordered by how far below
 * minimum each article is (F7.5.1), not a cursor list, so no `nextCursor`.
 */
export const lowStockReportSchema = z.object({
  data: z.array(lowStockArticleSchema),
});
export type LowStockReport = z.infer<typeof lowStockReportSchema>;

export const articleIdParamsSchema = z.object({ id: idSchema });
export type ArticleIdParams = z.infer<typeof articleIdParamsSchema>;
