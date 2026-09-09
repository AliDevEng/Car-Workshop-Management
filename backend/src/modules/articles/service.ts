import {
  ForbiddenError,
  NotFoundError,
  compareQuantity,
  parseQuantity,
  subQuantity,
  type Article,
  type CreateArticleInput,
  type LowStockArticle,
  type Quantity,
  type UpdateArticleInput,
  type UserRole,
} from 'shared';
import { writeAuditLog } from '../../lib/audit.js';
import { toDecimalString } from '../../lib/dto-decimal.js';
import type { Database } from '../../lib/prisma.js';
import {
  ARTICLE_SELECT,
  findArticleRecord,
  findLowStockArticles,
  normaliseOeNumber,
  toArticleDto,
  toLowStockDto,
  type ArticleRecord,
} from './repository.js';

/**
 * The article catalogue (PROJECT_SPEC.md §4.2, §6.4).
 *
 * Prices and VAT are money, so every mutation is audited (§4.2). §5.3 makes
 * "price changes on articles" `ADMIN`-only: creating an article establishes a
 * price and is `ADMIN`-only at the route; a `PATCH` is open to any staff for
 * the non-price fields, and this module refuses a price change from a
 * non-admin so the disabled control in the UI is backed by the API (F7.2.4).
 *
 * Stock is never touched here — that goes through `recordMovement` in
 * `stock.service.ts`, which locks the row and writes the ledger.
 */

/** Who is making the change. `PATCH` needs the role to guard price fields. */
export type Actor = { readonly id: string; readonly role: UserRole };

/** The money fields only an `ADMIN` may change on an existing article (§5.3). */
const PRICE_FIELDS = [
  'salesPriceOre',
  'purchasePriceOre',
  'vatRateBps',
] as const;

/** Uppercased, whitespace-stripped and de-duplicated, order preserved (§7.2). */
function normaliseOeNumbers(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalised = normaliseOeNumber(value);
    if (normalised !== '' && !seen.has(normalised)) {
      seen.add(normalised);
      result.push(normalised);
    }
  }
  return result;
}

/** What the audit log records about an article. Never the cached stock — that
 * is the ledger's job, audited separately by the stock service. */
function auditSnapshot(record: ArticleRecord): Record<string, unknown> {
  return {
    sku: record.sku,
    name: record.name,
    description: record.description,
    unit: record.unit,
    salesPriceOre: record.salesPriceOre,
    purchasePriceOre: record.purchasePriceOre,
    vatRateBps: record.vatRateBps,
    minimumQuantity: toDecimalString(record.minimumQuantity),
    location: record.location,
    oeNumbers: record.oeNumbers,
    isActive: record.isActive,
  };
}

/**
 * Refuses a price or VAT change from a non-admin and reports whether one was
 * made, so the audit action can name it (`article.price_changed`).
 */
function assertMayChangePrices(
  actor: Actor,
  input: UpdateArticleInput,
  before: ArticleRecord,
): boolean {
  const priceChanged = PRICE_FIELDS.some(
    (field) => input[field] !== undefined && input[field] !== before[field],
  );
  if (priceChanged && actor.role !== 'ADMIN') {
    throw new ForbiddenError(
      'Endast administratörer får ändra priser och momssats.',
    );
  }
  return priceChanged;
}

export async function getArticle(db: Database, id: string): Promise<Article> {
  const record = await findArticleRecord(db, id);
  if (record === null) {
    throw new NotFoundError('Artikeln kunde inte hittas.');
  }
  return toArticleDto(record);
}

export async function createArticle(
  db: Database,
  actorId: string,
  ipHash: string | null,
  input: CreateArticleInput,
): Promise<Article> {
  const oeNumbers = normaliseOeNumbers(input.oeNumbers);

  return db.$transaction(async (tx) => {
    const created = await tx.article.create({
      data: {
        sku: input.sku,
        name: input.name,
        unit: input.unit,
        salesPriceOre: input.salesPriceOre,
        vatRateBps: input.vatRateBps,
        minimumQuantity: input.minimumQuantity,
        oeNumbers,
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
        ...(input.purchasePriceOre === undefined
          ? {}
          : { purchasePriceOre: input.purchasePriceOre }),
        ...(input.location === undefined ? {} : { location: input.location }),
      },
      select: ARTICLE_SELECT,
    });

    await writeAuditLog(tx, {
      userId: actorId,
      action: 'article.created',
      entityType: 'Article',
      entityId: created.id,
      after: auditSnapshot(created),
      ipHash,
    });

    return toArticleDto(created);
  });
}

export async function updateArticle(
  db: Database,
  actor: Actor,
  ipHash: string | null,
  id: string,
  input: UpdateArticleInput,
): Promise<Article> {
  const oeNumbers =
    input.oeNumbers === undefined
      ? undefined
      : normaliseOeNumbers(input.oeNumbers);

  return db.$transaction(async (tx) => {
    const before = await tx.article.findUnique({
      where: { id },
      select: ARTICLE_SELECT,
    });
    if (before === null) {
      throw new NotFoundError('Artikeln kunde inte hittas.');
    }

    const priceChanged = assertMayChangePrices(actor, input, before);

    const after = await tx.article.update({
      where: { id },
      data: {
        ...(input.sku === undefined ? {} : { sku: input.sku }),
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
        ...(input.unit === undefined ? {} : { unit: input.unit }),
        ...(input.salesPriceOre === undefined
          ? {}
          : { salesPriceOre: input.salesPriceOre }),
        ...(input.purchasePriceOre === undefined
          ? {}
          : { purchasePriceOre: input.purchasePriceOre }),
        ...(input.vatRateBps === undefined
          ? {}
          : { vatRateBps: input.vatRateBps }),
        ...(input.minimumQuantity === undefined
          ? {}
          : { minimumQuantity: input.minimumQuantity }),
        ...(input.location === undefined ? {} : { location: input.location }),
        ...(oeNumbers === undefined ? {} : { oeNumbers }),
      },
      select: ARTICLE_SELECT,
    });

    await writeAuditLog(tx, {
      userId: actor.id,
      action: priceChanged ? 'article.price_changed' : 'article.updated',
      entityType: 'Article',
      entityId: id,
      before: auditSnapshot(before),
      after: auditSnapshot(after),
      ipHash,
    });

    return toArticleDto(after);
  });
}

/**
 * Deactivate and reactivate are their own routes, not an `isActive` field on
 * the patch — the same reasoning as customers (§4.3). Idempotent: deactivating
 * a deactivated article is not an error.
 */
async function setArticleActive(
  db: Database,
  actorId: string,
  ipHash: string | null,
  id: string,
  isActive: boolean,
): Promise<Article> {
  return db.$transaction(async (tx) => {
    const before = await tx.article.findUnique({
      where: { id },
      select: ARTICLE_SELECT,
    });
    if (before === null) {
      throw new NotFoundError('Artikeln kunde inte hittas.');
    }

    if (before.isActive === isActive) {
      return toArticleDto(before);
    }

    const after = await tx.article.update({
      where: { id },
      data: { isActive },
      select: ARTICLE_SELECT,
    });

    await writeAuditLog(tx, {
      userId: actorId,
      action: isActive ? 'article.reactivated' : 'article.deactivated',
      entityType: 'Article',
      entityId: id,
      before: auditSnapshot(before),
      after: auditSnapshot(after),
      ipHash,
    });

    return toArticleDto(after);
  });
}

export function deactivateArticle(
  db: Database,
  actorId: string,
  ipHash: string | null,
  id: string,
): Promise<Article> {
  return setArticleActive(db, actorId, ipHash, id, false);
}

export function reactivateArticle(
  db: Database,
  actorId: string,
  ipHash: string | null,
  id: string,
): Promise<Article> {
  return setArticleActive(db, actorId, ipHash, id, true);
}

/** `minimumQuantity − stockQuantity`; positive for an article below minimum. */
function stockDeficit(row: LowStockArticle): Quantity {
  return subQuantity(
    parseQuantity(row.minimumQuantity),
    parseQuantity(row.stockQuantity),
  );
}

/**
 * Every active article below its minimum, ordered by how far below it is
 * (F7.5.1). The set is small, so the sort is done here rather than in a query
 * that cannot order by an expression.
 */
export async function getLowStockArticles(
  db: Database,
): Promise<LowStockArticle[]> {
  const rows = await findLowStockArticles(db);
  return rows
    .map(toLowStockDto)
    .sort((a, b) => compareQuantity(stockDeficit(b), stockDeficit(a)));
}
