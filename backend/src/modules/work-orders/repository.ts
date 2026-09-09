import {
  calculateWorkOrderTotals,
  ore,
  parseDecimal,
  type DocumentTotalsDto,
  type LineTotals,
  type WorkOrder,
  type WorkOrderDetail,
  type WorkOrderHistoryEntry,
  type WorkOrderLine,
  type WorkOrderListItem,
  type WorkOrderStatus,
} from 'shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../lib/prisma.js';
import { toDecimalString } from '../../lib/dto-decimal.js';
import { toIsoDateTime, toIsoDateTimeOrNull } from '../../lib/dto-dates.js';

/**
 * Data access for work orders (PROJECT_SPEC.md §4.2, §6.5, §8.2).
 *
 * Every function returns a plain DTO, never a Prisma model: §8.2 forbids a
 * model reaching a route, and the `Decimal` quantities have to become strings
 * before a response schema will accept them. Stock is never written here —
 * that goes through `recordMovement`, which locks the article row first.
 */

const workOrderFields = {
  id: true,
  number: true,
  bookingId: true,
  vehicleId: true,
  customerId: true,
  status: true,
  odometerKmIn: true,
  odometerKmOut: true,
  assignedUserId: true,
  description: true,
  internalNote: true,
  completedAt: true,
  completedByUserId: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} as const;

const workOrderLineFields = {
  id: true,
  workOrderId: true,
  sortOrder: true,
  type: true,
  articleId: true,
  description: true,
  quantity: true,
  unit: true,
  unitPriceOre: true,
  vatRateBps: true,
  stockDeducted: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Lines in display order, which is also the order the totals are summed in.
 * `id` breaks a tie so two lines sharing a `sortOrder` — briefly possible
 * while a reorder is in flight — do not swap places between two reads.
 *
 * Annotated rather than `as const`: Prisma's `orderBy` is a mutable array
 * type, and a `readonly` tuple is not assignable to it.
 */
export const LINE_ORDER_BY: Prisma.WorkOrderLineOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { id: 'asc' },
];

const linesInOrder = {
  select: workOrderLineFields,
  orderBy: LINE_ORDER_BY,
};

const relationFields = {
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
  assignedUser: { select: { id: true, name: true, role: true } },
} as const;

const workOrderDetailFields = {
  ...workOrderFields,
  ...relationFields,
  lines: linesInOrder,
} as const;

export type WorkOrderRecord = Prisma.WorkOrderGetPayload<{
  select: typeof workOrderFields;
}>;

export type WorkOrderLineRecord = Prisma.WorkOrderLineGetPayload<{
  select: typeof workOrderLineFields;
}>;

export type WorkOrderDetailRecord = Prisma.WorkOrderGetPayload<{
  select: typeof workOrderDetailFields;
}>;

export const WORK_ORDER_SELECT = workOrderFields;
export const WORK_ORDER_LINE_SELECT = workOrderLineFields;
export const WORK_ORDER_DETAIL_SELECT = workOrderDetailFields;

// --- Totals ------------------------------------------------------------------

/**
 * A stored line as the money helpers want it: branded `Ore`, a `Decimal`
 * quantity, and the VAT rate the line was created with — never the article's
 * current one, which is the whole point of the snapshot (§4.2).
 */
function toLineInput(record: WorkOrderLineRecord): {
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

function toDocumentTotalsDto(totals: {
  netOre: number;
  vatOre: number;
  grossOre: number;
  roundingOre: number;
  roundedGrossOre: number;
}): DocumentTotalsDto {
  return {
    netOre: totals.netOre,
    vatOre: totals.vatOre,
    grossOre: totals.grossOre,
    roundingOre: totals.roundingOre,
    roundedGrossOre: totals.roundedGrossOre,
  };
}

/**
 * Line totals and document totals in one pass (B6.3).
 *
 * Both come out of `calculateWorkOrderTotals`, so the document totals are the
 * sum of exactly the values the client is shown per line. Computing the two
 * separately is §3.3's öre-level bug, and it only shows up on a document a
 * customer is holding.
 */
function computeTotals(lines: readonly WorkOrderLineRecord[]): {
  perLine: readonly LineTotals[];
  document: DocumentTotalsDto;
} {
  const computed = calculateWorkOrderTotals(lines.map(toLineInput));
  return {
    perLine: computed.lines,
    document: toDocumentTotalsDto(computed.totals),
  };
}

// --- DTO mapping -------------------------------------------------------------

export function toWorkOrderDto(record: WorkOrderRecord): WorkOrder {
  return {
    id: record.id,
    number: record.number,
    bookingId: record.bookingId,
    vehicleId: record.vehicleId,
    customerId: record.customerId,
    status: record.status,
    odometerKmIn: record.odometerKmIn,
    odometerKmOut: record.odometerKmOut,
    assignedUserId: record.assignedUserId,
    description: record.description,
    internalNote: record.internalNote,
    completedAt: toIsoDateTimeOrNull(record.completedAt),
    completedByUserId: record.completedByUserId,
    version: record.version,
    createdAt: toIsoDateTime(record.createdAt),
    updatedAt: toIsoDateTime(record.updatedAt),
  };
}

function toWorkOrderLineDto(
  record: WorkOrderLineRecord,
  totals: LineTotals,
): WorkOrderLine {
  return {
    id: record.id,
    workOrderId: record.workOrderId,
    sortOrder: record.sortOrder,
    type: record.type,
    articleId: record.articleId,
    description: record.description,
    quantity: toDecimalString(record.quantity),
    unit: record.unit,
    unitPriceOre: record.unitPriceOre,
    vatRateBps: record.vatRateBps,
    stockDeducted: record.stockDeducted,
    totals: {
      netOre: totals.netOre,
      vatOre: totals.vatOre,
      grossOre: totals.grossOre,
    },
    createdAt: toIsoDateTime(record.createdAt),
    updatedAt: toIsoDateTime(record.updatedAt),
  };
}

function toRelationsDto(record: WorkOrderDetailRecord): {
  customer: WorkOrderDetail['customer'];
  vehicle: WorkOrderDetail['vehicle'];
  assignedUser: WorkOrderDetail['assignedUser'];
} {
  return {
    customer: {
      id: record.customer.id,
      type: record.customer.type,
      name: record.customer.name,
      phone: record.customer.phone,
    },
    vehicle: {
      id: record.vehicle.id,
      registrationNumber: record.vehicle.registrationNumber,
      registrationNumberDisplay: record.vehicle.registrationNumberDisplay,
      make: record.vehicle.make,
      model: record.vehicle.model,
    },
    assignedUser:
      record.assignedUser === null
        ? null
        : {
            id: record.assignedUser.id,
            name: record.assignedUser.name,
            role: record.assignedUser.role,
          },
  };
}

/**
 * Only reachable if `perLine` and `record.lines` ever stop being
 * index-aligned, which they cannot be — but `noUncheckedIndexedAccess` is on
 * and the alternative is the `!` CLAUDE.md bans.
 */
const EMPTY_LINE_TOTALS: LineTotals = {
  netOre: ore(0),
  vatOre: ore(0),
  grossOre: ore(0),
};

export function toWorkOrderDetailDto(
  record: WorkOrderDetailRecord,
): WorkOrderDetail {
  const totals = computeTotals(record.lines);

  return {
    ...toWorkOrderDto(record),
    ...toRelationsDto(record),
    lines: record.lines.map((line, index) =>
      toWorkOrderLineDto(line, totals.perLine[index] ?? EMPTY_LINE_TOTALS),
    ),
    totals: totals.document,
  };
}

function toWorkOrderListItemDto(
  record: WorkOrderDetailRecord,
): WorkOrderListItem {
  return {
    ...toWorkOrderDto(record),
    ...toRelationsDto(record),
    lineCount: record.lines.length,
    totals: computeTotals(record.lines).document,
  };
}

export function toWorkOrderHistoryEntryDto(
  record: WorkOrderDetailRecord,
): WorkOrderHistoryEntry {
  return {
    id: record.id,
    number: record.number,
    status: record.status,
    description: record.description,
    odometerKmOut: record.odometerKmOut,
    completedAt: toIsoDateTimeOrNull(record.completedAt),
    totals: computeTotals(record.lines).document,
    createdAt: toIsoDateTime(record.createdAt),
  };
}

// --- Reads -------------------------------------------------------------------

export function findWorkOrderRecord(
  db: Database | Prisma.TransactionClient,
  id: string,
): Promise<WorkOrderRecord | null> {
  return db.workOrder.findUnique({ where: { id }, select: workOrderFields });
}

export function findWorkOrderDetailRecord(
  db: Database | Prisma.TransactionClient,
  id: string,
): Promise<WorkOrderDetailRecord | null> {
  return db.workOrder.findUnique({
    where: { id },
    select: workOrderDetailFields,
  });
}

export type ListWorkOrdersOptions = {
  readonly limit: number;
  readonly cursor?: string | undefined;
  readonly status?: WorkOrderStatus | undefined;
  readonly vehicleId?: string | undefined;
  readonly customerId?: string | undefined;
  readonly assignedUserId?: string | undefined;
  readonly bookingId?: string | undefined;
};

function listWhere(options: ListWorkOrdersOptions): Prisma.WorkOrderWhereInput {
  return {
    ...(options.status === undefined ? {} : { status: options.status }),
    ...(options.vehicleId === undefined
      ? {}
      : { vehicleId: options.vehicleId }),
    ...(options.customerId === undefined
      ? {}
      : { customerId: options.customerId }),
    ...(options.assignedUserId === undefined
      ? {}
      : { assignedUserId: options.assignedUserId }),
    ...(options.bookingId === undefined
      ? {}
      : { bookingId: options.bookingId }),
  };
}

/**
 * Cursor pagination on `id DESC` — a UUIDv7, unique and monotonic by creation
 * time, so §8.1's composite cursor is not needed (the same reasoning as every
 * other list in this codebase). `number` is deliberately not the sort key: a
 * draft has none, and sorting by a nullable column puts every unfinished job
 * at one end of the list.
 */
export async function listWorkOrders(
  db: Database,
  options: ListWorkOrdersOptions,
): Promise<{ data: WorkOrderListItem[]; nextCursor: string | null }> {
  const rows = await db.workOrder.findMany({
    where: listWhere(options),
    select: workOrderDetailFields,
    orderBy: { id: 'desc' },
    take: options.limit + 1,
    ...(options.cursor === undefined
      ? {}
      : { cursor: { id: options.cursor }, skip: 1 }),
  });

  const page = rows.slice(0, options.limit);
  const nextCursor =
    rows.length > options.limit ? (page.at(-1)?.id ?? null) : null;

  return { data: page.map(toWorkOrderListItemDto), nextCursor };
}

/**
 * The service history behind a vehicle or a customer page (§6.3, B6.8.1).
 *
 * Newest first by `id DESC`, which for a UUIDv7 is newest-created first — not
 * by `completedAt`, which is null on everything still in progress and would
 * therefore hide exactly the jobs a service adviser is looking for.
 */
export async function listWorkOrderHistory(
  db: Database,
  where: Prisma.WorkOrderWhereInput,
  options: { readonly limit: number; readonly cursor?: string | undefined },
): Promise<{ data: WorkOrderHistoryEntry[]; nextCursor: string | null }> {
  const rows = await db.workOrder.findMany({
    where,
    select: workOrderDetailFields,
    orderBy: { id: 'desc' },
    take: options.limit + 1,
    ...(options.cursor === undefined
      ? {}
      : { cursor: { id: options.cursor }, skip: 1 }),
  });

  const page = rows.slice(0, options.limit);
  const nextCursor =
    rows.length > options.limit ? (page.at(-1)?.id ?? null) : null;

  return { data: page.map(toWorkOrderHistoryEntryDto), nextCursor };
}
