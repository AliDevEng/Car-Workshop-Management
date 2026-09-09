import type {
  StockMovement,
  StockMovementType,
  StockMovementWithUser,
} from 'shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../lib/prisma.js';
import { toDecimalString } from '../../lib/dto-decimal.js';
import { toIsoDateTime } from '../../lib/dto-dates.js';

/**
 * Data access for the stock ledger (PROJECT_SPEC.md §4.2, §6.4, §8.2).
 *
 * The ledger is append-only and it is the truth; `Article.stockQuantity` is a
 * cache written only alongside a movement, inside the same transaction, with
 * the article row locked. These functions take a `TransactionClient` so the
 * caller owns that transaction — B6 deducts several lines and writes its own
 * audit row in one atomic unit.
 */

const stockMovementFields = {
  id: true,
  articleId: true,
  type: true,
  quantity: true,
  balanceAfter: true,
  workOrderId: true,
  userId: true,
  note: true,
  occurredAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const stockMovementWithUserFields = {
  ...stockMovementFields,
  user: { select: { id: true, name: true, role: true } },
} as const;

export type StockMovementRecord = Prisma.StockMovementGetPayload<{
  select: typeof stockMovementFields;
}>;

type StockMovementWithUserRecord = Prisma.StockMovementGetPayload<{
  select: typeof stockMovementWithUserFields;
}>;

type ArticleBalanceRow = Prisma.ArticleGetPayload<{
  select: { stockQuantity: true };
}>;

export function toStockMovementDto(record: StockMovementRecord): StockMovement {
  return {
    id: record.id,
    articleId: record.articleId,
    type: record.type,
    quantity: toDecimalString(record.quantity),
    balanceAfter: toDecimalString(record.balanceAfter),
    workOrderId: record.workOrderId,
    userId: record.userId,
    note: record.note,
    occurredAt: toIsoDateTime(record.occurredAt),
    createdAt: toIsoDateTime(record.createdAt),
    updatedAt: toIsoDateTime(record.updatedAt),
  };
}

function toStockMovementWithUserDto(
  record: StockMovementWithUserRecord,
): StockMovementWithUser {
  return {
    ...toStockMovementDto(record),
    user: {
      id: record.user.id,
      name: record.user.name,
      role: record.user.role,
    },
  };
}

/**
 * `SELECT ... FOR UPDATE` on one article row. Raw because Prisma has no
 * `FOR UPDATE`; the tagged template parameterises `${articleId}`, so it
 * carries no interpolation. This is the explicit row lock §8.2 requires and
 * the decision log (2026-09-08) anticipates for the ledger — and CLAUDE.md
 * fixes the order: the article row is locked before any work-order row.
 *
 * A missing row locks nothing and is handled by the balance read that follows.
 */
export async function lockArticleRow(
  tx: Prisma.TransactionClient,
  articleId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM "Article" WHERE "id" = ${articleId} FOR UPDATE`;
}

export function readArticleBalance(
  tx: Prisma.TransactionClient,
  articleId: string,
): Promise<ArticleBalanceRow | null> {
  return tx.article.findUnique({
    where: { id: articleId },
    select: { stockQuantity: true },
  });
}

export type InsertStockMovementInput = {
  readonly articleId: string;
  readonly type: StockMovementType;
  /** Signed decimal string; a consumption is negative. */
  readonly quantity: string;
  readonly balanceAfter: string;
  readonly userId: string;
  readonly note: string | null;
  readonly workOrderId: string | null;
  readonly occurredAt: Date;
};

export function insertStockMovement(
  tx: Prisma.TransactionClient,
  input: InsertStockMovementInput,
): Promise<StockMovementRecord> {
  return tx.stockMovement.create({
    data: {
      articleId: input.articleId,
      type: input.type,
      quantity: input.quantity,
      balanceAfter: input.balanceAfter,
      userId: input.userId,
      note: input.note,
      workOrderId: input.workOrderId,
      occurredAt: input.occurredAt,
    },
    select: stockMovementFields,
  });
}

export async function updateArticleBalance(
  tx: Prisma.TransactionClient,
  articleId: string,
  balance: string,
): Promise<void> {
  await tx.article.update({
    where: { id: articleId },
    data: { stockQuantity: balance },
  });
}

export type ListStockMovementsOptions = {
  readonly limit: number;
  readonly cursor?: string | undefined;
  readonly type?: StockMovementType | undefined;
};

/**
 * Newest-entered first, cursor-paginated on `id DESC`. The id is a UUIDv7 —
 * unique and monotonic by insertion time — so one column is a stable cursor.
 * `occurredAt` can be backdated by a work order (B6); that is a display
 * concern the frontend sorts on, not a cursor key (§8.1), exactly as for
 * odometer readings.
 */
export async function listStockMovements(
  db: Database,
  articleId: string,
  options: ListStockMovementsOptions,
): Promise<{ data: StockMovementWithUser[]; nextCursor: string | null }> {
  const rows = await db.stockMovement.findMany({
    where: {
      articleId,
      ...(options.type === undefined ? {} : { type: options.type }),
    },
    select: stockMovementWithUserFields,
    orderBy: { id: 'desc' },
    take: options.limit + 1,
    ...(options.cursor === undefined
      ? {}
      : { cursor: { id: options.cursor }, skip: 1 }),
  });

  const page = rows.slice(0, options.limit);
  const nextCursor =
    rows.length > options.limit ? (page.at(-1)?.id ?? null) : null;

  return { data: page.map(toStockMovementWithUserDto), nextCursor };
}
