import {
  NotFoundError,
  ValidationError,
  addQuantity,
  isNegativeQuantity,
  isZeroQuantity,
  parseQuantity,
  quantityToString,
  subQuantity,
  type Quantity,
  type StockAdjustmentInput,
  type StockMovementResult,
  type StockMovementType,
  type StockMovementWithUser,
  type StocktakeInput,
  type StocktakeResult,
} from 'shared';
import { writeAuditLog } from '../../lib/audit.js';
import { toDecimalString } from '../../lib/dto-decimal.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../lib/prisma.js';
import {
  insertStockMovement,
  lockArticleRow,
  listStockMovements,
  readArticleBalance,
  toStockMovementDto,
  updateArticleBalance,
  type ListStockMovementsOptions,
  type StockMovementRecord,
} from './stock.repository.js';

/**
 * The stock ledger (PROJECT_SPEC.md §4.2, §6.4).
 *
 * **The ledger is the truth; `Article.stockQuantity` is a cache.** Every change
 * goes through `recordMovement`, which is the one place that locks the article
 * row, reads the balance, writes the movement and updates the cache — so 50
 * concurrent consumptions serialise and the cache cannot drift from the sum of
 * the ledger (the iteration's Definition of Done).
 */

/**
 * How the movement's signed delta is arrived at. `delta` is used directly —
 * a purchase, a consumption, a manual adjustment. `target` is a physical
 * count: the delta is `target − balanceBefore`, computed here so the read and
 * the arithmetic stay inside the lock (§6.4, stocktake).
 */
export type MovementAmount =
  | { readonly kind: 'delta'; readonly value: Quantity }
  | { readonly kind: 'target'; readonly value: Quantity };

export type RecordMovementInput = {
  readonly articleId: string;
  readonly type: StockMovementType;
  readonly amount: MovementAmount;
  readonly userId: string;
  readonly note?: string | null;
  readonly workOrderId?: string | null;
  readonly occurredAt?: Date;
};

export type RecordedMovement = {
  readonly movement: StockMovementRecord;
  /** The signed delta actually applied. */
  readonly delta: Quantity;
  readonly balanceBefore: Quantity;
  readonly balanceAfter: Quantity;
  /** Non-blocking advisories — a balance that went negative (§6.4). */
  readonly warnings: string[];
};

/**
 * Records one stock movement inside the caller's transaction.
 *
 * Stock is allowed to go negative, with a warning, and is never blocked:
 * stopping a mechanic from finishing a job because the count is wrong is worse
 * than an inaccurate count (§6.4). The one hard failure is a resulting balance
 * outside the `Decimal(12, 3)` column — that is a data error, surfaced as a
 * `400` rather than a `RangeError` turning into a `500`.
 */
export async function recordMovement(
  tx: Prisma.TransactionClient,
  input: RecordMovementInput,
): Promise<RecordedMovement> {
  await lockArticleRow(tx, input.articleId);

  const row = await readArticleBalance(tx, input.articleId);
  if (row === null) {
    throw new NotFoundError('Artikeln kunde inte hittas.');
  }

  const balanceBefore = parseQuantity(toDecimalString(row.stockQuantity));

  let delta: Quantity;
  let balanceAfter: Quantity;
  try {
    // Both computed after the lock. A `target` count far from the current
    // balance can produce a delta outside the column, and the sum of two
    // in-range quantities can still leave its bounds — either way, throwing
    // here rolls the whole movement back rather than half-writing it, and the
    // caller gets a `400` instead of a `RangeError` becoming a `500`.
    delta =
      input.amount.kind === 'delta'
        ? input.amount.value
        : subQuantity(input.amount.value, balanceBefore);
    balanceAfter = addQuantity(balanceBefore, delta);
  } catch (error) {
    throw new ValidationError(
      'Lagersaldot eller förändringen hamnar utanför det tillåtna intervallet.',
      { cause: error },
    );
  }

  const movement = await insertStockMovement(tx, {
    articleId: input.articleId,
    type: input.type,
    quantity: quantityToString(delta),
    balanceAfter: quantityToString(balanceAfter),
    userId: input.userId,
    note: input.note ?? null,
    workOrderId: input.workOrderId ?? null,
    occurredAt: input.occurredAt ?? new Date(),
  });

  await updateArticleBalance(
    tx,
    input.articleId,
    quantityToString(balanceAfter),
  );

  const warnings: string[] = [];
  if (isNegativeQuantity(balanceAfter)) {
    warnings.push(
      `Lagersaldot är nu ${quantityToString(balanceAfter)} och har gått ` +
        'under noll. Kontrollera saldot.',
    );
  }

  return { movement, delta, balanceBefore, balanceAfter, warnings };
}

/** The balance snapshot written to the audit log for a stock change. */
function balanceSnapshot(balance: Quantity): Record<string, unknown> {
  return { stockQuantity: quantityToString(balance) };
}

/**
 * A manual correction (§5.3 — `ADMIN`-only). `quantity` is the signed delta,
 * never a target balance: an endpoint taking a target would silently overwrite
 * a concurrent movement instead of adding to it (`shared/schemas/stock.ts`).
 */
export async function adjustStock(
  db: Database,
  actorId: string,
  ipHash: string | null,
  articleId: string,
  input: StockAdjustmentInput,
): Promise<StockMovementResult> {
  const delta = parseQuantity(input.quantity);
  if (isZeroQuantity(delta)) {
    throw new ValidationError('Uppgifterna kunde inte valideras.', {
      details: [
        { path: 'quantity', message: 'Ange en justering skild från noll.' },
      ],
    });
  }

  return db.$transaction(async (tx) => {
    const result = await recordMovement(tx, {
      articleId,
      type: 'ADJUSTMENT',
      amount: { kind: 'delta', value: delta },
      userId: actorId,
      note: input.note,
    });

    await writeAuditLog(tx, {
      userId: actorId,
      action: 'stock.adjusted',
      entityType: 'Article',
      entityId: articleId,
      before: balanceSnapshot(result.balanceBefore),
      after: {
        ...balanceSnapshot(result.balanceAfter),
        movementId: result.movement.id,
        quantity: quantityToString(result.delta),
      },
      ipHash,
    });

    return {
      movement: toStockMovementDto(result.movement),
      warnings: result.warnings,
    };
  });
}

/**
 * Stocktake takes the **counted** quantity and the system writes the
 * correcting `STOCKTAKE` movement for the difference (§6.4, §5.3 — `ADMIN`).
 */
export async function recordStocktake(
  db: Database,
  actorId: string,
  ipHash: string | null,
  articleId: string,
  input: StocktakeInput,
): Promise<StocktakeResult> {
  const counted = parseQuantity(input.countedQuantity);
  if (isNegativeQuantity(counted)) {
    throw new ValidationError('Uppgifterna kunde inte valideras.', {
      details: [
        {
          path: 'countedQuantity',
          message: 'Ett räknat antal kan inte vara negativt.',
        },
      ],
    });
  }

  return db.$transaction(async (tx) => {
    const result = await recordMovement(tx, {
      articleId,
      type: 'STOCKTAKE',
      amount: { kind: 'target', value: counted },
      userId: actorId,
      note: input.note ?? null,
    });

    await writeAuditLog(tx, {
      userId: actorId,
      action: 'stock.stocktake',
      entityType: 'Article',
      entityId: articleId,
      before: balanceSnapshot(result.balanceBefore),
      after: {
        ...balanceSnapshot(result.balanceAfter),
        movementId: result.movement.id,
        differenceQuantity: quantityToString(result.delta),
      },
      ipHash,
    });

    return {
      movement: toStockMovementDto(result.movement),
      differenceQuantity: quantityToString(result.delta),
      balanceAfter: quantityToString(result.balanceAfter),
    };
  });
}

export async function getStockMovements(
  db: Database,
  articleId: string,
  options: ListStockMovementsOptions,
): Promise<{ data: StockMovementWithUser[]; nextCursor: string | null }> {
  const article = await db.article.findUnique({
    where: { id: articleId },
    select: { id: true },
  });
  if (article === null) {
    throw new NotFoundError('Artikeln kunde inte hittas.');
  }
  return listStockMovements(db, articleId, options);
}
