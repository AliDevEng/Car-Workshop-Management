import type { Article, LowStockArticle } from 'shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../lib/prisma.js';
import { toDecimalString } from '../../lib/dto-decimal.js';
import { toIsoDateTime } from '../../lib/dto-dates.js';

/**
 * Data access for the article catalogue (PROJECT_SPEC.md §4.2, §6.4).
 *
 * Every function returns a plain DTO, never a Prisma model: §8.2 forbids a
 * model reaching a route, and the `Decimal` quantities have to become strings
 * and the `Date` fields ISO strings before a response schema will accept them.
 * Stock is never written here — that goes through `recordMovement` in
 * `stock.service.ts`, which locks the row first.
 */

const articleFields = {
  id: true,
  sku: true,
  name: true,
  description: true,
  unit: true,
  salesPriceOre: true,
  purchasePriceOre: true,
  vatRateBps: true,
  stockQuantity: true,
  minimumQuantity: true,
  location: true,
  oeNumbers: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type ArticleRecord = Prisma.ArticleGetPayload<{
  select: typeof articleFields;
}>;

export function toArticleDto(record: ArticleRecord): Article {
  return {
    id: record.id,
    sku: record.sku,
    name: record.name,
    description: record.description,
    unit: record.unit,
    salesPriceOre: record.salesPriceOre,
    purchasePriceOre: record.purchasePriceOre,
    vatRateBps: record.vatRateBps,
    stockQuantity: toDecimalString(record.stockQuantity),
    minimumQuantity: toDecimalString(record.minimumQuantity),
    location: record.location,
    oeNumbers: record.oeNumbers,
    isActive: record.isActive,
    createdAt: toIsoDateTime(record.createdAt),
    updatedAt: toIsoDateTime(record.updatedAt),
  };
}

export function toLowStockDto(record: ArticleRecord): LowStockArticle {
  return {
    id: record.id,
    sku: record.sku,
    name: record.name,
    unit: record.unit,
    salesPriceOre: record.salesPriceOre,
    vatRateBps: record.vatRateBps,
    stockQuantity: toDecimalString(record.stockQuantity),
    minimumQuantity: toDecimalString(record.minimumQuantity),
    location: record.location,
  };
}

/**
 * The `?q=` predicate shared by the article list (B4.1.2) and the global
 * search (§6.3, B4.6): SKU and name matched as typed, and an OE number matched
 * exactly against its stored normalised form (uppercase, no spaces). LIKE
 * metacharacters are stripped, as in the customer and vehicle predicates.
 */
export function articleSearchWhere(term: string): Prisma.ArticleWhereInput {
  const cleaned = term.replace(/[\\%_]/g, ' ').trim();
  if (cleaned === '') {
    return { id: { in: [] } };
  }

  const or: Prisma.ArticleWhereInput[] = [
    { sku: { contains: cleaned, mode: 'insensitive' } },
    { name: { contains: cleaned, mode: 'insensitive' } },
  ];

  const oeNumber = normaliseOeNumber(cleaned);
  if (oeNumber.length >= 2) {
    or.push({ oeNumbers: { has: oeNumber } });
  }

  return { OR: or };
}

/** Uppercase, no whitespace — the form OE numbers are stored and searched in. */
export function normaliseOeNumber(value: string): string {
  return value.toUpperCase().replace(/\s+/g, '');
}

export type ListArticlesOptions = {
  readonly limit: number;
  readonly cursor?: string | undefined;
  readonly q?: string | undefined;
  readonly lowStock?: boolean | undefined;
  readonly isActive?: boolean | undefined;
};

/**
 * "Below minimum" is a column-to-column comparison, so it uses a Prisma field
 * reference rather than raw SQL (§5.4 keeps raw SQL to the numbering sequence,
 * the reconciliation job and the ledger row lock).
 *
 * Exported because the dashboard counts the same set (§6.8, B6.8.2). A second
 * copy of the rule is how a card and the list it links to end up disagreeing
 * about what "below minimum" means.
 */
export function belowMinimum(db: Database): Prisma.ArticleWhereInput {
  return { stockQuantity: { lt: db.article.fields.minimumQuantity } };
}

/**
 * Cursor pagination on `id DESC` — a UUIDv7, unique and monotonic by creation
 * time, so §8.1's composite cursor is not needed (same reasoning as
 * `listCustomers`).
 */
export async function listArticles(
  db: Database,
  options: ListArticlesOptions,
): Promise<{ data: Article[]; nextCursor: string | null }> {
  const where: Prisma.ArticleWhereInput = {
    ...(options.isActive === undefined ? {} : { isActive: options.isActive }),
    ...(options.lowStock === true ? belowMinimum(db) : {}),
    ...(options.q === undefined ? {} : articleSearchWhere(options.q)),
  };

  const rows = await db.article.findMany({
    where,
    select: articleFields,
    orderBy: { id: 'desc' },
    take: options.limit + 1,
    ...(options.cursor === undefined
      ? {}
      : { cursor: { id: options.cursor }, skip: 1 }),
  });

  const page = rows.slice(0, options.limit);
  const nextCursor =
    rows.length > options.limit ? (page.at(-1)?.id ?? null) : null;

  return { data: page.map(toArticleDto), nextCursor };
}

/**
 * Every active article below its minimum. The low-stock set is small by
 * definition, so the "how far below" sort (F7.5.1) is done in the service on
 * the full set rather than pushed into a query that cannot order by an
 * expression. A ceiling guards against a misconfigured catalogue.
 */
const LOW_STOCK_CEILING = 1000;

export async function findLowStockArticles(
  db: Database,
): Promise<ArticleRecord[]> {
  return db.article.findMany({
    where: { isActive: true, ...belowMinimum(db) },
    select: articleFields,
    orderBy: { sku: 'asc' },
    take: LOW_STOCK_CEILING,
  });
}

export function findArticleRecord(
  db: Database,
  id: string,
): Promise<ArticleRecord | null> {
  return db.article.findUnique({ where: { id }, select: articleFields });
}

export const ARTICLE_SELECT = articleFields;
