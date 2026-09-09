import {
  ConflictError,
  NotFoundError,
  WORK_ORDER_STATUS_LABELS,
  isZeroQuantity,
  parseQuantity,
  type CreateWorkOrderLineInput,
  type ReorderWorkOrderLinesInput,
  type UpdateWorkOrderLineInput,
  type WorkOrderResponse,
  type WorkOrderStatus,
} from 'shared';
import { writeAuditLog } from '../../lib/audit.js';
import { fieldError } from '../../lib/field-error.js';
import { toDecimalString } from '../../lib/dto-decimal.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../lib/prisma.js';
import {
  WORK_ORDER_LINE_SELECT,
  type WorkOrderLineRecord,
} from './repository.js';
import { loadWorkOrder, loadWorkOrderResponse } from './service.js';

/**
 * Work-order lines (PROJECT_SPEC.md §4.2, §6.5; B6.2).
 *
 * **A line snapshots the article's name, price, unit and VAT rate at the
 * moment it is added** and never joins back to the live article for display.
 * If oil goes up 30 kr next month, a quote printed today must still print
 * today's price — that is the difference between a system a customer can trust
 * and one that quietly rewrites history.
 *
 * Line writes are **not** version-checked (§6.5, B6.4.2). Two mechanics adding
 * different lines to one job is normal, correct behaviour; version-checking it
 * produces constant false conflicts, which trains people to click through the
 * warning — and then the real conflict is ignored too. They do bump the
 * parent's version, so a stale *header* edit is still caught.
 */

/**
 * The statuses a line may not be written in.
 *
 * B6.2.3 names `COMPLETED`, and `CANCELLED` belongs with it: it is terminal
 * (§4.3, B1.4), so editing the lines of one would be editing a record that can
 * never be acted on again. Both are reversible in the sense that matters — a
 * completed order can be reverted to `IN_PROGRESS`, which is the supported way
 * to correct it and which writes the compensating stock movements on the way.
 */
const LINES_LOCKED_IN: readonly WorkOrderStatus[] = ['COMPLETED', 'CANCELLED'];

const LINES_LOCKED_MESSAGE =
  'Arbetsordern är låst och dess rader kan inte ändras. Återöppna den först.';

function assertLinesWritable(status: WorkOrderStatus): void {
  if (LINES_LOCKED_IN.includes(status)) {
    throw new ConflictError(
      `Rader kan inte ändras när arbetsordern är ${WORK_ORDER_STATUS_LABELS[
        status
      ].toLowerCase()}.`,
      { details: { status } },
    );
  }
}

/**
 * Bumps the parent's version, and re-checks the status **atomically** while
 * doing it (§6.5, B6.4.2).
 *
 * The bump itself is the easy half: line writes are not version-checked,
 * because two mechanics adding different lines to one job is correct behaviour
 * and must not fail — but the header they are both looking at *has* changed,
 * so a stale header edit is still caught.
 *
 * The status predicate is the half that is easy to miss. `assertLinesWritable`
 * above reads the status without holding a lock, so a completion committing in
 * between would leave a line added to an order that is already `COMPLETED` —
 * and therefore a `PART` line that will never be deducted, because deduction
 * has already run. Putting the status in the `where` makes this the same
 * compare-and-swap the header uses: the write either lands on an order that is
 * still open, or it does not land at all.
 */
async function bumpVersionForLineWrite(
  tx: Prisma.TransactionClient,
  workOrderId: string,
): Promise<void> {
  const result = await tx.workOrder.updateMany({
    where: { id: workOrderId, status: { notIn: [...LINES_LOCKED_IN] } },
    data: { version: { increment: 1 } },
  });

  if (result.count === 0) {
    throw new ConflictError(LINES_LOCKED_MESSAGE);
  }
}

/** What the audit log records about a line. Money, so §4.2 audits it. */
function auditSnapshot(record: WorkOrderLineRecord): Record<string, unknown> {
  return {
    type: record.type,
    articleId: record.articleId,
    description: record.description,
    quantity: toDecimalString(record.quantity),
    unit: record.unit,
    unitPriceOre: record.unitPriceOre,
    vatRateBps: record.vatRateBps,
    sortOrder: record.sortOrder,
    stockDeducted: record.stockDeducted,
  };
}

/**
 * A quantity of zero contributes nothing and cannot be deducted meaningfully;
 * it is a half-finished edit, not a line. Negative is allowed — a credited
 * line is a real thing (§3.2 keeps öre signed for exactly that reason).
 */
function assertUsableQuantity(quantity: string): void {
  if (isZeroQuantity(parseQuantity(quantity))) {
    throw fieldError('quantity', 'Ange ett antal skilt från noll.');
  }
}

/**
 * The article a `PART` line points at, if it names one.
 *
 * Only its existence is checked. The line's own `description`, `unit`,
 * `unitPriceOre` and `vatRateBps` arrive from the client and are stored as
 * given: staff adjust a price, and the snapshot has to record what was
 * actually charged rather than what the catalogue said.
 */
async function assertArticleExists(
  tx: Prisma.TransactionClient,
  articleId: string,
): Promise<void> {
  const article = await tx.article.findUnique({
    where: { id: articleId },
    select: { id: true },
  });
  if (article === null) {
    throw fieldError('articleId', 'Artikeln kunde inte hittas.');
  }
}

/** The next free position, so a new line lands at the bottom of the list. */
async function nextSortOrder(
  tx: Prisma.TransactionClient,
  workOrderId: string,
): Promise<number> {
  const highest = await tx.workOrderLine.aggregate({
    where: { workOrderId },
    _max: { sortOrder: true },
  });
  const current = highest._max.sortOrder;
  return current === null ? 0 : current + 1;
}

export async function addWorkOrderLine(
  db: Database,
  actorId: string,
  ipHash: string | null,
  workOrderId: string,
  input: CreateWorkOrderLineInput,
): Promise<WorkOrderResponse> {
  assertUsableQuantity(input.quantity);

  return db.$transaction(async (tx) => {
    const workOrder = await loadWorkOrder(tx, workOrderId);
    assertLinesWritable(workOrder.status);

    if (input.articleId !== undefined) {
      await assertArticleExists(tx, input.articleId);
    }

    const sortOrder = input.sortOrder ?? (await nextSortOrder(tx, workOrderId));

    const created = await tx.workOrderLine.create({
      data: {
        workOrderId,
        sortOrder,
        type: input.type,
        description: input.description,
        quantity: input.quantity,
        unit: input.unit,
        unitPriceOre: input.unitPriceOre,
        vatRateBps: input.vatRateBps,
        ...(input.articleId === undefined
          ? {}
          : { articleId: input.articleId }),
      },
      select: WORK_ORDER_LINE_SELECT,
    });

    await bumpVersionForLineWrite(tx, workOrderId);

    await writeAuditLog(tx, {
      userId: actorId,
      action: 'work_order_line.created',
      entityType: 'WorkOrderLine',
      entityId: created.id,
      after: { workOrderId, ...auditSnapshot(created) },
      ipHash,
    });

    return loadWorkOrderResponse(tx, workOrderId);
  });
}

/** The line, checked to belong to the order named in the path. */
async function loadLine(
  tx: Prisma.TransactionClient,
  workOrderId: string,
  lineId: string,
): Promise<WorkOrderLineRecord> {
  const line = await tx.workOrderLine.findUnique({
    where: { id: lineId },
    select: WORK_ORDER_LINE_SELECT,
  });

  // A line belonging to a *different* order is a `404`, not a `403`: the
  // resource named by this path does not exist, and any other answer would
  // confirm that some other order has a line with that id.
  if (line === null || line.workOrderId !== workOrderId) {
    throw new NotFoundError('Raden kunde inte hittas.');
  }
  return line;
}

export async function updateWorkOrderLine(
  db: Database,
  actorId: string,
  ipHash: string | null,
  workOrderId: string,
  lineId: string,
  input: UpdateWorkOrderLineInput,
): Promise<WorkOrderResponse> {
  if (input.quantity !== undefined) {
    assertUsableQuantity(input.quantity);
  }

  return db.$transaction(async (tx) => {
    const workOrder = await loadWorkOrder(tx, workOrderId);
    assertLinesWritable(workOrder.status);

    const before = await loadLine(tx, workOrderId, lineId);

    if (input.articleId !== undefined) {
      await assertArticleExists(tx, input.articleId);
    }

    const after = await tx.workOrderLine.update({
      where: { id: lineId },
      data: {
        ...(input.type === undefined ? {} : { type: input.type }),
        ...(input.articleId === undefined
          ? {}
          : { articleId: input.articleId }),
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
        ...(input.quantity === undefined ? {} : { quantity: input.quantity }),
        ...(input.unit === undefined ? {} : { unit: input.unit }),
        ...(input.unitPriceOre === undefined
          ? {}
          : { unitPriceOre: input.unitPriceOre }),
        ...(input.vatRateBps === undefined
          ? {}
          : { vatRateBps: input.vatRateBps }),
        ...(input.sortOrder === undefined
          ? {}
          : { sortOrder: input.sortOrder }),
      },
      select: WORK_ORDER_LINE_SELECT,
    });

    await bumpVersionForLineWrite(tx, workOrderId);

    await writeAuditLog(tx, {
      userId: actorId,
      action: 'work_order_line.updated',
      entityType: 'WorkOrderLine',
      entityId: lineId,
      before: auditSnapshot(before),
      after: auditSnapshot(after),
      ipHash,
    });

    return loadWorkOrderResponse(tx, workOrderId);
  });
}

export async function deleteWorkOrderLine(
  db: Database,
  actorId: string,
  ipHash: string | null,
  workOrderId: string,
  lineId: string,
): Promise<WorkOrderResponse> {
  return db.$transaction(async (tx) => {
    const workOrder = await loadWorkOrder(tx, workOrderId);
    assertLinesWritable(workOrder.status);

    const before = await loadLine(tx, workOrderId, lineId);

    // Belt and braces behind `assertLinesWritable`: a line whose stock has
    // been deducted must not be able to disappear, because the ledger row
    // pointing at it would then describe a movement for a part nobody can find
    // on the job (§6.4).
    if (before.stockDeducted) {
      throw new ConflictError(
        'Raden har redan dragits från lagret och kan inte tas bort. ' +
          'Återöppna arbetsordern först.',
      );
    }

    await tx.workOrderLine.delete({ where: { id: lineId } });
    await bumpVersionForLineWrite(tx, workOrderId);

    await writeAuditLog(tx, {
      userId: actorId,
      action: 'work_order_line.deleted',
      entityType: 'WorkOrderLine',
      entityId: lineId,
      before: { workOrderId, ...auditSnapshot(before) },
      ipHash,
    });

    return loadWorkOrderResponse(tx, workOrderId);
  });
}

/**
 * Reordering (B6.2.4).
 *
 * The whole list arrives at once and has to be exactly the order's lines — no
 * more, no fewer. A partial list would leave the omitted lines holding
 * positions that now collide, and "collide" here means two lines swapping
 * places on a printed quote between one look and the next.
 */
export async function reorderWorkOrderLines(
  db: Database,
  actorId: string,
  ipHash: string | null,
  workOrderId: string,
  input: ReorderWorkOrderLinesInput,
): Promise<WorkOrderResponse> {
  return db.$transaction(async (tx) => {
    const workOrder = await loadWorkOrder(tx, workOrderId);
    assertLinesWritable(workOrder.status);

    const existing = await tx.workOrderLine.findMany({
      where: { workOrderId },
      select: { id: true },
    });

    const requested = new Set(input.lineIds);
    if (
      requested.size !== input.lineIds.length ||
      requested.size !== existing.length ||
      !existing.every((line) => requested.has(line.id))
    ) {
      throw fieldError(
        'lineIds',
        'Listan måste innehålla exakt arbetsorderns alla rader, en gång var.',
      );
    }

    // Sequential rather than `Promise.all`: these are updates to rows in one
    // table inside one transaction, and issuing them concurrently through a
    // single connection buys nothing while making the lock order arbitrary.
    for (const [index, lineId] of input.lineIds.entries()) {
      await tx.workOrderLine.update({
        where: { id: lineId },
        data: { sortOrder: index },
      });
    }

    await bumpVersionForLineWrite(tx, workOrderId);

    await writeAuditLog(tx, {
      userId: actorId,
      action: 'work_order.lines_reordered',
      entityType: 'WorkOrder',
      entityId: workOrderId,
      after: { lineIds: input.lineIds },
      ipHash,
    });

    return loadWorkOrderResponse(tx, workOrderId);
  });
}
