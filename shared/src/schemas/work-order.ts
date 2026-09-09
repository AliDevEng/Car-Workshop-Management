import { z } from 'zod';
import { WORK_ORDER_STATUSES } from '../work-order-state.js';
import {
  cursorQuerySchema,
  paginatedResponseSchema,
  warningsSchema,
} from './common.js';
import { customerSummarySchema } from './customer.js';
import {
  documentNumberSchema,
  documentTotalsSchema,
  idSchema,
  isoDateTimeSchema,
  lineTotalsSchema,
  noteSchema,
  odometerKmSchema,
  optionalIdSchema,
  oreSchema,
  quantityStringSchema,
  shortTextSchema,
  sortOrderSchema,
  timestampFields,
  vatRateBpsSchema,
  versionSchema,
} from './primitives.js';
import { unitSchema } from './article.js';
import { userSummarySchema } from './user.js';
import { vehicleSummarySchema } from './vehicle.js';

/**
 * Work orders — PROJECT_SPEC.md §4.2, §6.5.
 *
 * The status enum comes from `shared/work-order-state.ts`, which also owns the
 * transition table. One list, one state machine: the API rejects an illegal
 * transition and the UI greys out the same buttons from the same source.
 */
export const workOrderStatusSchema = z.enum(WORK_ORDER_STATUSES);

export const WORK_ORDER_LINE_TYPES = ['LABOUR', 'PART', 'FEE'] as const;
export type WorkOrderLineType = (typeof WORK_ORDER_LINE_TYPES)[number];

export const WORK_ORDER_LINE_TYPE_LABELS: Readonly<
  Record<WorkOrderLineType, string>
> = {
  LABOUR: 'Arbete',
  PART: 'Reservdel',
  FEE: 'Avgift',
};

export const workOrderLineTypeSchema = z.enum(WORK_ORDER_LINE_TYPES);

/**
 * A line **snapshots** the article's description, price, unit and VAT rate at
 * the moment it is added, and never joins to the live article for display
 * (§4.2). If oil goes up 30 kr next month, a quote printed today must still
 * print today's price. `articleId` is kept only so stock can be deducted and
 * the part traced — never so the row can be re-read for display.
 */
export const workOrderLineSchema = z.object({
  id: idSchema,
  workOrderId: idSchema,
  sortOrder: sortOrderSchema,
  type: workOrderLineTypeSchema,
  articleId: optionalIdSchema,
  description: shortTextSchema,
  quantity: quantityStringSchema,
  unit: unitSchema,
  unitPriceOre: oreSchema,
  vatRateBps: vatRateBpsSchema,
  /**
   * Set once, when the order moves to `COMPLETED` (§6.4). Adding a `PART` line
   * does not deduct stock; this flag is what makes a re-run — a double-tapped
   * *Slutför* on a laggy tablet — safe.
   */
  stockDeducted: z.boolean(),
  /**
   * Computed by the backend from the fields above, in the §3.3 order. The
   * browser formats these; it never calculates them.
   */
  totals: lineTotalsSchema,
  ...timestampFields,
});
export type WorkOrderLine = z.infer<typeof workOrderLineSchema>;

/**
 * A free-text line needs no article; a `PART` line usually has one. The price
 * is accepted rather than read from the article, because staff adjust it — and
 * because the snapshot has to record what was actually charged.
 */
export const createWorkOrderLineInputSchema = z.object({
  type: workOrderLineTypeSchema,
  articleId: idSchema.optional(),
  description: shortTextSchema,
  quantity: quantityStringSchema,
  unit: unitSchema,
  unitPriceOre: oreSchema,
  vatRateBps: vatRateBpsSchema,
  sortOrder: sortOrderSchema.optional(),
});
export type CreateWorkOrderLineInput = z.infer<
  typeof createWorkOrderLineInputSchema
>;

export const updateWorkOrderLineInputSchema =
  createWorkOrderLineInputSchema.partial();
export type UpdateWorkOrderLineInput = z.infer<
  typeof updateWorkOrderLineInputSchema
>;

export const workOrderSchema = z.object({
  id: idSchema,
  /**
   * `AO-2026-0001`, from a Postgres sequence inside the creating transaction —
   * never `SELECT MAX(number) + 1`, which produces duplicates the first time
   * two people click at once (§4.4).
   *
   * **Null while the order is a `DRAFT`.** §4.4 assigns a number when the
   * document is finalised rather than when the draft is created, so that
   * abandoned drafts do not leave gaps in the series — and §4.3 allows a
   * `DRAFT` work order to be deleted outright, which is exactly such a gap.
   */
  number: documentNumberSchema.nullable(),
  bookingId: optionalIdSchema,
  vehicleId: idSchema,
  customerId: idSchema,
  status: workOrderStatusSchema,
  odometerKmIn: odometerKmSchema.nullable(),
  odometerKmOut: odometerKmSchema.nullable(),
  assignedUserId: optionalIdSchema,
  description: shortTextSchema,
  internalNote: noteSchema.nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  /**
   * Who completed it (B6.5.3). §4.2's field list does not name it and the
   * audit log does record the actor — but an audit log is for answering
   * "who changed this and when", not for rendering a screen or a service
   * protocol, and reading one to label a work order is how it stops being
   * append-only in practice. Cleared again when the order is reverted, so it
   * always describes the *current* completion rather than a past one.
   */
  completedByUserId: optionalIdSchema,
  /**
   * Optimistic lock. A `PATCH` sends the version it read; a mismatch is a
   * `409` and the UI offers to reload. It guards **header fields and status
   * only** — line writes bump it but are not checked against it, because two
   * mechanics adding different lines to the same job is correct behaviour and
   * must not fail (§6.5).
   */
  version: versionSchema,
  ...timestampFields,
});
export type WorkOrder = z.infer<typeof workOrderSchema>;

/** The mechanic's screen: the order, its lines and the totals (§6.5). */
export const workOrderDetailSchema = workOrderSchema.extend({
  customer: customerSummarySchema,
  vehicle: vehicleSummarySchema,
  assignedUser: userSummarySchema.nullable(),
  lines: z.array(workOrderLineSchema),
  totals: documentTotalsSchema,
});
export type WorkOrderDetail = z.infer<typeof workOrderDetailSchema>;

/**
 * A row of the work-order list (B6.1.3, F9). It carries the totals rather than
 * the lines: a list wants "hur mycket" per job, and shipping every line of
 * every order to render a table is the difference between one query and a
 * screen that stalls. The backend calculates them; the browser formats
 * (CLAUDE.md).
 */
export const workOrderListItemSchema = workOrderSchema.extend({
  customer: customerSummarySchema,
  vehicle: vehicleSummarySchema,
  assignedUser: userSummarySchema.nullable(),
  lineCount: z.number().int().min(0),
  totals: documentTotalsSchema,
});
export type WorkOrderListItem = z.infer<typeof workOrderListItemSchema>;

export const workOrderListResponseSchema = paginatedResponseSchema(
  workOrderListItemSchema,
);
export type WorkOrderListResponse = z.infer<typeof workOrderListResponseSchema>;

export const createWorkOrderInputSchema = z.object({
  vehicleId: idSchema,
  customerId: idSchema,
  bookingId: idSchema.optional(),
  description: shortTextSchema,
  odometerKmIn: odometerKmSchema.optional(),
  assignedUserId: idSchema.optional(),
  internalNote: noteSchema.optional(),
});
export type CreateWorkOrderInput = z.infer<typeof createWorkOrderInputSchema>;

/**
 * `status` is absent: a transition is its own endpoint, because it has
 * preconditions and side effects — completion requires an out-odometer and at
 * least one line, and it deducts stock (§6.5). Folding it into a general patch
 * would hide that behind a field assignment.
 */
export const updateWorkOrderInputSchema = z
  .object({
    description: shortTextSchema,
    odometerKmIn: odometerKmSchema.nullable(),
    odometerKmOut: odometerKmSchema.nullable(),
    assignedUserId: idSchema.nullable(),
    internalNote: noteSchema.nullable(),
  })
  .partial()
  .extend({ version: versionSchema });
export type UpdateWorkOrderInput = z.infer<typeof updateWorkOrderInputSchema>;

export const changeWorkOrderStatusInputSchema = z.object({
  status: workOrderStatusSchema,
  version: versionSchema,
  /**
   * Only meaningful for the transition into `COMPLETED`, which requires it
   * (§6.5). Optional here so the same endpoint serves every transition; the
   * service enforces the requirement and returns a Swedish message naming it.
   */
  odometerKmOut: odometerKmSchema.optional(),
});
export type ChangeWorkOrderStatusInput = z.infer<
  typeof changeWorkOrderStatusInputSchema
>;

/**
 * What every work-order **mutation** answers with.
 *
 * Completion deducts stock, so it can leave balances negative — allowed, with
 * a warning (§6.4) — and can flag an out-odometer below the vehicle's previous
 * highest (§3.5). Both reach the UI as warnings on a *successful* response; a
 * warning never replaces an error.
 *
 * Line writes answer with the same envelope, which is what lets §6.5's
 * "the client refetches lines and totals after every line mutation" be one
 * round trip rather than two: the whole order, its lines and its recomputed
 * totals come back from the write itself.
 */
export const workOrderResponseSchema = z.object({
  workOrder: workOrderDetailSchema,
  warnings: warningsSchema,
});
export type WorkOrderResponse = z.infer<typeof workOrderResponseSchema>;

/**
 * B1.5 named this contract for the status endpoint specifically. It is the
 * same envelope, kept as a name so a reader looking for the §6.5 status
 * response finds it where the plan said it would be.
 */
export const workOrderStatusChangeResponseSchema = workOrderResponseSchema;
export type WorkOrderStatusChangeResponse = WorkOrderResponse;

export const workOrderListQuerySchema = cursorQuerySchema.extend({
  status: workOrderStatusSchema.optional(),
  vehicleId: idSchema.optional(),
  customerId: idSchema.optional(),
  assignedUserId: idSchema.optional(),
  /**
   * The calendar's link from a booking to the job it became (§6.2 → §6.5,
   * B6.8.3). A booking may have more than one work order over its life, so
   * this is a filter rather than a lookup by a unique key.
   */
  bookingId: idSchema.optional(),
});
export type WorkOrderListQuery = z.infer<typeof workOrderListQuerySchema>;

export const workOrderIdParamsSchema = z.object({ id: idSchema });
export type WorkOrderIdParams = z.infer<typeof workOrderIdParamsSchema>;

export const workOrderLineParamsSchema = z.object({
  id: idSchema,
  lineId: idSchema,
});
export type WorkOrderLineParams = z.infer<typeof workOrderLineParamsSchema>;

/**
 * Reordering sends the complete list of line ids in their new order (B6.2.4),
 * not a single line's new index. A per-line index has to be reconciled against
 * every other line's, and two mechanics dragging at once produce two orders
 * that each look valid and together lose a line's place; a whole list is one
 * write that either applies or does not.
 */
export const reorderWorkOrderLinesInputSchema = z.object({
  lineIds: z.array(idSchema).min(1).max(200),
});
export type ReorderWorkOrderLinesInput = z.infer<
  typeof reorderWorkOrderLinesInputSchema
>;

/** A row of the vehicle page's newest-first service history (§6.3, B6.8). */
export const workOrderHistoryEntrySchema = z.object({
  id: idSchema,
  number: documentNumberSchema.nullable(),
  status: workOrderStatusSchema,
  description: shortTextSchema,
  odometerKmOut: odometerKmSchema.nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  totals: documentTotalsSchema,
  createdAt: isoDateTimeSchema,
});
export type WorkOrderHistoryEntry = z.infer<typeof workOrderHistoryEntrySchema>;

/**
 * `GET /api/vehicles/:id/work-orders` and `/api/customers/:id/work-orders`
 * (B6.8.1).
 *
 * Two endpoints, one shape, and the difference between them is the point: a
 * vehicle's history follows the **vehicle**, so it survives a change of owner
 * (§6.3), while a customer's history is the jobs billed to them and does not
 * follow a car they sold.
 */
export const workOrderHistoryResponseSchema = paginatedResponseSchema(
  workOrderHistoryEntrySchema,
);
export type WorkOrderHistoryResponse = z.infer<
  typeof workOrderHistoryResponseSchema
>;
