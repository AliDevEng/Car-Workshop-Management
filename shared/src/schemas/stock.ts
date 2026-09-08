import { z } from 'zod';
import { cursorQuerySchema, warningsSchema } from './common.js';
import {
  idSchema,
  isoDateTimeSchema,
  noteSchema,
  optionalIdSchema,
  quantityStringSchema,
  timestampFields,
} from './primitives.js';
import { userSummarySchema } from './user.js';

/**
 * The stock ledger — PROJECT_SPEC.md §4.2 and §6.4.
 *
 * **The ledger is the truth; `Article.stockQuantity` is a cache.** Every
 * mutation writes a movement and updates the cached balance inside the same
 * transaction, with the article row locked. That is what makes "why did the
 * oil run out?" answerable.
 */
export const STOCK_MOVEMENT_TYPES = [
  'PURCHASE',
  'CONSUMPTION',
  'ADJUSTMENT',
  'STOCKTAKE',
  'RETURN',
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const STOCK_MOVEMENT_TYPE_LABELS: Readonly<
  Record<StockMovementType, string>
> = {
  PURCHASE: 'Inköp',
  CONSUMPTION: 'Förbrukning',
  ADJUSTMENT: 'Justering',
  STOCKTAKE: 'Inventering',
  RETURN: 'Retur',
};

export const stockMovementTypeSchema = z.enum(STOCK_MOVEMENT_TYPES);

export const stockMovementSchema = z.object({
  id: idSchema,
  articleId: idSchema,
  type: stockMovementTypeSchema,
  /**
   * Signed: a consumption is negative, a purchase positive. Never an absolute
   * value plus a direction flag — the sum of this column *is* the balance, and
   * a flag that can disagree with the sign is a second source of truth.
   */
  quantity: quantityStringSchema,
  /** The balance immediately after this movement, for auditing the chain. */
  balanceAfter: quantityStringSchema,
  workOrderId: optionalIdSchema,
  userId: idSchema,
  note: noteSchema.nullable(),
  occurredAt: isoDateTimeSchema,
  ...timestampFields,
});
export type StockMovement = z.infer<typeof stockMovementSchema>;

/** The per-article movement list: who, when and why (§6.4). */
export const stockMovementWithUserSchema = stockMovementSchema.extend({
  user: userSummarySchema,
});
export type StockMovementWithUser = z.infer<typeof stockMovementWithUserSchema>;

export const stockMovementListQuerySchema = cursorQuerySchema.extend({
  type: stockMovementTypeSchema.optional(),
});
export type StockMovementListQuery = z.infer<
  typeof stockMovementListQuerySchema
>;

/**
 * A manual correction. `quantity` is the signed delta, not the new balance:
 * an endpoint that took a target balance would silently overwrite a concurrent
 * movement instead of adding to it.
 */
export const stockAdjustmentInputSchema = z.object({
  quantity: quantityStringSchema,
  note: noteSchema,
});
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentInputSchema>;

/**
 * Stocktake takes the **counted** quantity, and the system writes the
 * correcting movement for the difference (§6.4). This is the one place a
 * target balance is the right input, because a physical count is exactly that.
 */
export const stocktakeInputSchema = z.object({
  countedQuantity: quantityStringSchema,
  note: noteSchema.optional(),
});
export type StocktakeInput = z.infer<typeof stocktakeInputSchema>;

export const stocktakeResultSchema = z.object({
  movement: stockMovementSchema,
  /** Counted minus the balance before the count. Signed. */
  differenceQuantity: quantityStringSchema,
  balanceAfter: quantityStringSchema,
});
export type StocktakeResult = z.infer<typeof stocktakeResultSchema>;

/**
 * Stock is allowed to go negative, with a warning, and is never blocked:
 * stopping a mechanic from finishing a job because the count is wrong is worse
 * than an inaccurate count (§6.4).
 */
export const stockMovementResultSchema = z.object({
  movement: stockMovementSchema,
  warnings: warningsSchema,
});
export type StockMovementResult = z.infer<typeof stockMovementResultSchema>;
