import {
  calculateWorkOrderTotals,
  ore,
  parseDecimal,
  type DocumentTotalsDto,
  type LineTotals,
  type Quote,
  type QuoteDetail,
  type QuoteLine,
  type QuoteListItem,
  type QuoteStatus,
} from 'shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../lib/prisma.js';
import { toDecimalString } from '../../lib/dto-decimal.js';
import {
  toIsoDateTime,
  toIsoDateTimeOrNull,
  toIsoDateOrNull,
} from '../../lib/dto-dates.js';

/**
 * Data access for quotes (PROJECT_SPEC.md §4.2, §6.6, §8.2).
 *
 * Every function returns a plain DTO, never a Prisma model, and every
 * `Decimal` becomes a string on the way out (§8.2).
 *
 * **The document totals come from the stored columns, and only the per-line
 * values are computed.** This is the deliberate difference from
 * `work-orders/repository.ts`, which computes both: a work order's lines
 * change, so a stored total there would drift, while a quote's lines are
 * frozen at creation and the numbers the customer was given must survive a
 * later change to how totals are calculated.
 * `backend/tests/quotes.test.ts` asserts the two agree, which is what stops
 * the difference becoming a discrepancy.
 */

const quoteFields = {
  id: true,
  workOrderId: true,
  number: true,
  revision: true,
  supersedesQuoteId: true,
  status: true,
  validUntil: true,
  netOre: true,
  vatOre: true,
  grossOre: true,
  roundingOre: true,
  documentId: true,
  sentAt: true,
  respondedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const quoteLineFields = {
  id: true,
  quoteId: true,
  sortOrder: true,
  type: true,
  articleId: true,
  description: true,
  quantity: true,
  unit: true,
  unitPriceOre: true,
  vatRateBps: true,
} as const;

/**
 * Lines in display order, which is also the order the totals were summed in.
 * `id` breaks a tie so two lines sharing a `sortOrder` do not swap places
 * between two reads — mirroring `LINE_ORDER_BY` on the work order.
 */
export const QUOTE_LINE_ORDER_BY: Prisma.QuoteLineOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { id: 'asc' },
];

const relationFields = {
  workOrder: {
    select: {
      id: true,
      number: true,
      description: true,
      customer: { select: { id: true, type: true, name: true, phone: true } },
      vehicle: {
        select: {
          id: true,
          registrationNumber: true,
          registrationNumberDisplay: true,
          make: true,
          model: true,
        },
      },
    },
  },
} as const;

const quoteDetailFields = {
  ...quoteFields,
  ...relationFields,
  lines: { select: quoteLineFields, orderBy: QUOTE_LINE_ORDER_BY },
} as const;

export type QuoteRecord = Prisma.QuoteGetPayload<{
  select: typeof quoteFields;
}>;

export type QuoteLineRecord = Prisma.QuoteLineGetPayload<{
  select: typeof quoteLineFields;
}>;

export type QuoteDetailRecord = Prisma.QuoteGetPayload<{
  select: typeof quoteDetailFields;
}>;

export const QUOTE_SELECT = quoteFields;
export const QUOTE_LINE_SELECT = quoteLineFields;
export const QUOTE_DETAIL_SELECT = quoteDetailFields;

// --- Totals ------------------------------------------------------------------

/**
 * A stored quote line as the money helpers want it. The VAT rate is the line's
 * own snapshot, never the article's current one — that is the point of the
 * snapshot (§4.2).
 */
export function toQuoteLineInput(record: QuoteLineRecord): {
  unitPriceOre: ReturnType<typeof ore>;
  quantity: ReturnType<typeof parseDecimal>;
  vatRateBps: number;
} {
  return {
    unitPriceOre: ore(record.unitPriceOre),
    quantity: parseDecimal(toDecimalString(record.quantity)),
    vatRateBps: record.vatRateBps,
  };
}

export function computeQuoteLineTotals(
  lines: readonly QuoteLineRecord[],
): readonly LineTotals[] {
  return calculateWorkOrderTotals(lines.map(toQuoteLineInput)).lines;
}

/**
 * The stored totals, as the API reports them.
 *
 * `roundedGrossOre` is derived here rather than stored: it is `grossOre +
 * roundingOre`, and a stored addition is a fifth column that can disagree with
 * the four that are the record.
 */
export function toStoredTotalsDto(record: {
  netOre: number;
  vatOre: number;
  grossOre: number;
  roundingOre: number;
}): DocumentTotalsDto {
  return {
    netOre: record.netOre,
    vatOre: record.vatOre,
    grossOre: record.grossOre,
    roundingOre: record.roundingOre,
    roundedGrossOre: record.grossOre + record.roundingOre,
  };
}

// --- DTO mapping -------------------------------------------------------------

export function toQuoteDto(record: QuoteRecord): Quote {
  return {
    id: record.id,
    workOrderId: record.workOrderId,
    number: record.number,
    revision: record.revision,
    supersedesQuoteId: record.supersedesQuoteId,
    status: record.status,
    // A `date` column: `YYYY-MM-DD`, with no time part and no zone (§3.6).
    // Non-null in the database, so the null branch is unreachable — but
    // `toIsoDateOrNull` is the one mapper that exists, and `?? ''` would be a
    // lie the schema would then reject loudly rather than silently.
    validUntil: toIsoDateOrNull(record.validUntil) ?? '',
    netOre: record.netOre,
    vatOre: record.vatOre,
    grossOre: record.grossOre,
    roundingOre: record.roundingOre,
    documentId: record.documentId,
    sentAt: toIsoDateTimeOrNull(record.sentAt),
    respondedAt: toIsoDateTimeOrNull(record.respondedAt),
    createdAt: toIsoDateTime(record.createdAt),
    updatedAt: toIsoDateTime(record.updatedAt),
  };
}

function toQuoteLineDto(
  record: QuoteLineRecord,
  totals: LineTotals,
): QuoteLine {
  return {
    id: record.id,
    quoteId: record.quoteId,
    sortOrder: record.sortOrder,
    type: record.type,
    articleId: record.articleId,
    description: record.description,
    quantity: toDecimalString(record.quantity),
    unit: record.unit,
    unitPriceOre: record.unitPriceOre,
    vatRateBps: record.vatRateBps,
    totals: {
      netOre: totals.netOre,
      vatOre: totals.vatOre,
      grossOre: totals.grossOre,
    },
  };
}

/**
 * Only reachable if the computed totals and the lines ever stop being
 * index-aligned, which they cannot be — but `noUncheckedIndexedAccess` is on
 * and the alternative is the `!` CLAUDE.md bans.
 */
const EMPTY_LINE_TOTALS: LineTotals = {
  netOre: ore(0),
  vatOre: ore(0),
  grossOre: ore(0),
};

function toRelationsDto(record: QuoteDetailRecord): {
  customer: QuoteDetail['customer'];
  vehicle: QuoteDetail['vehicle'];
} {
  return {
    customer: {
      id: record.workOrder.customer.id,
      type: record.workOrder.customer.type,
      name: record.workOrder.customer.name,
      phone: record.workOrder.customer.phone,
    },
    vehicle: {
      id: record.workOrder.vehicle.id,
      registrationNumber: record.workOrder.vehicle.registrationNumber,
      registrationNumberDisplay:
        record.workOrder.vehicle.registrationNumberDisplay,
      make: record.workOrder.vehicle.make,
      model: record.workOrder.vehicle.model,
    },
  };
}

export function toQuoteDetailDto(record: QuoteDetailRecord): QuoteDetail {
  const lineTotals = computeQuoteLineTotals(record.lines);

  return {
    ...toQuoteDto(record),
    ...toRelationsDto(record),
    workOrderNumber: record.workOrder.number,
    lines: record.lines.map((line, index) =>
      toQuoteLineDto(line, lineTotals[index] ?? EMPTY_LINE_TOTALS),
    ),
    totals: toStoredTotalsDto(record),
  };
}

function toQuoteListItemDto(record: QuoteDetailRecord): QuoteListItem {
  return {
    ...toQuoteDto(record),
    ...toRelationsDto(record),
    lineCount: record.lines.length,
    totals: toStoredTotalsDto(record),
  };
}

// --- Reads -------------------------------------------------------------------

export function findQuoteRecord(
  db: Database | Prisma.TransactionClient,
  id: string,
): Promise<QuoteRecord | null> {
  return db.quote.findUnique({ where: { id }, select: quoteFields });
}

export function findQuoteDetailRecord(
  db: Database | Prisma.TransactionClient,
  id: string,
): Promise<QuoteDetailRecord | null> {
  return db.quote.findUnique({ where: { id }, select: quoteDetailFields });
}

export function findQuoteLineRecords(
  db: Database | Prisma.TransactionClient,
  quoteId: string,
): Promise<QuoteLineRecord[]> {
  return db.quoteLine.findMany({
    where: { quoteId },
    select: quoteLineFields,
    orderBy: QUOTE_LINE_ORDER_BY,
  });
}

export type ListQuotesOptions = {
  readonly limit: number;
  readonly cursor?: string | undefined;
  readonly status?: QuoteStatus | undefined;
  readonly workOrderId?: string | undefined;
};

/**
 * Cursor pagination on `id DESC` — a UUIDv7, unique and monotonic by creation
 * time, so §8.1's composite cursor is not needed. `number` is deliberately not
 * the sort key: a draft has none, and sorting by a nullable column puts every
 * unsent quote at one end of the list.
 */
export async function listQuotes(
  db: Database,
  options: ListQuotesOptions,
): Promise<{ data: QuoteListItem[]; nextCursor: string | null }> {
  const rows = await db.quote.findMany({
    where: {
      ...(options.status === undefined ? {} : { status: options.status }),
      ...(options.workOrderId === undefined
        ? {}
        : { workOrderId: options.workOrderId }),
    },
    select: quoteDetailFields,
    orderBy: { id: 'desc' },
    take: options.limit + 1,
    ...(options.cursor === undefined
      ? {}
      : { cursor: { id: options.cursor }, skip: 1 }),
  });

  const page = rows.slice(0, options.limit);
  const nextCursor =
    rows.length > options.limit ? (page.at(-1)?.id ?? null) : null;

  return { data: page.map(toQuoteListItemDto), nextCursor };
}
