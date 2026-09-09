import {
  ConflictError,
  assertTransition,
  negateQuantity,
  parseQuantity,
  quantityToString,
  type ChangeWorkOrderStatusInput,
  type WorkOrderResponse,
  type WorkOrderStatus,
} from 'shared';
import { writeAuditLog } from '../../lib/audit.js';
import { fieldError } from '../../lib/field-error.js';
import { toDecimalString } from '../../lib/dto-decimal.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { recordMovement } from '../articles/stock.service.js';
import { recordWorkOrderOdometer } from './odometer.js';
import {
  LINE_ORDER_BY,
  WORK_ORDER_LINE_SELECT,
  type WorkOrderLineRecord,
  type WorkOrderRecord,
} from './repository.js';
import {
  assignNumberIfMissing,
  auditSnapshot,
  loadWorkOrder,
  loadWorkOrderResponse,
  updateWithVersion,
} from './service.js';

/**
 * Status transitions and stock deduction (PROJECT_SPEC.md §6.4, §6.5; B6.5,
 * B6.6).
 *
 * This is the file the whole iteration exists for, and three rules hold it
 * together:
 *
 * 1. **The state machine decides.** `assertTransition` comes from `shared/`,
 *    so the API rejects exactly what the UI greys out — one table, not two.
 * 2. **Stock moves once.** Adding a `PART` line deducts nothing; completion
 *    deducts every not-yet-deducted line and sets `stockDeducted`, so a
 *    double-tapped *Slutför* on a laggy tablet cannot deduct twice even if the
 *    state machine somehow let it through.
 * 3. **Reverting compensates, it does not erase.** Going back to
 *    `IN_PROGRESS` writes `RETURN` movements. The ledger is append-only: a
 *    correction is a new row, never a deleted one (§4.2).
 *
 * All of it runs in the caller's transaction — `runIdempotent` owns that — so
 * the effect and the idempotency row commit together (B6.6.3).
 */

/**
 * The lock order, and it is not incidental.
 *
 * CLAUDE.md fixes it: **article rows are always locked before work order
 * rows.** `recordMovement` takes `SELECT ... FOR UPDATE` on the article; the
 * work order's own row is locked last, by the version compare-and-swap that
 * ends this function. Deducting in a **deterministic article order** is the
 * other half — two completions sharing two articles would otherwise take the
 * same two locks in opposite orders and deadlock, which shows up as an
 * occasional 500 on the busiest morning of the month.
 */
function inDeterministicLockOrder(
  lines: readonly WorkOrderLineRecord[],
): WorkOrderLineRecord[] {
  return [...lines].sort((a, b) => {
    const left = a.articleId ?? '';
    const right = b.articleId ?? '';
    return left === right
      ? a.id.localeCompare(b.id)
      : left.localeCompare(right);
  });
}

/**
 * A line whose stock is the workshop's to move: a part, from the catalogue.
 *
 * Labour and fees have no stock, and a free-text part has no article to deduct
 * from — a mechanic writing "tätning från lådan" is describing something the
 * inventory never knew about, and inventing a movement for it would put a
 * balance in the ledger that no purchase ever created.
 */
function isDeductible(line: WorkOrderLineRecord): boolean {
  return line.type === 'PART' && line.articleId !== null;
}

async function loadLines(
  tx: Prisma.TransactionClient,
  workOrderId: string,
): Promise<WorkOrderLineRecord[]> {
  return tx.workOrderLine.findMany({
    where: { workOrderId },
    select: WORK_ORDER_LINE_SELECT,
    orderBy: LINE_ORDER_BY,
  });
}

/** What a stock pass actually moved, so the audit row can name it. */
type StockPass = {
  readonly warnings: string[];
  readonly movements: {
    lineId: string;
    articleId: string;
    quantity: string;
  }[];
};

const NO_STOCK_MOVED: StockPass = { warnings: [], movements: [] };

/**
 * Moves stock for every line the flag says still needs it (B6.6.1, B6.6.4).
 *
 * One function for both directions, because they differ only in the sign and
 * the movement type, and the guard — `stockDeducted` — is the same flag read
 * the opposite way round. Two near-identical loops is how one of them ends up
 * missing the flag update.
 *
 * The flag is set in the same transaction as the movement it describes, so
 * there is no window in which a part is off the shelf and the line does not
 * know it.
 */
async function moveStock(
  tx: Prisma.TransactionClient,
  workOrder: WorkOrderRecord,
  lines: readonly WorkOrderLineRecord[],
  actorId: string,
  direction: 'DEDUCT' | 'RETURN',
): Promise<StockPass> {
  const deducting = direction === 'DEDUCT';
  const label = workOrder.number ?? workOrder.id;
  const pass: StockPass = { warnings: [], movements: [] };

  for (const line of inDeterministicLockOrder(lines)) {
    // `articleId !== null` is re-tested rather than trusted from
    // `isDeductible`, because TypeScript cannot carry that narrowing across a
    // function call and the alternative is the `!` CLAUDE.md bans.
    if (
      !isDeductible(line) ||
      line.articleId === null ||
      line.stockDeducted === deducting
    ) {
      continue;
    }

    const quantity = parseQuantity(toDecimalString(line.quantity));
    const result = await recordMovement(tx, {
      articleId: line.articleId,
      type: deducting ? 'CONSUMPTION' : 'RETURN',
      // The ledger's sign *is* the direction, so there is no separate flag
      // that could ever disagree with it (§4.2).
      amount: {
        kind: 'delta',
        value: deducting ? negateQuantity(quantity) : quantity,
      },
      userId: actorId,
      workOrderId: workOrder.id,
      note: deducting
        ? `Förbrukning på arbetsorder ${label}`
        : `Återföring från arbetsorder ${label}`,
    });

    await tx.workOrderLine.update({
      where: { id: line.id },
      data: { stockDeducted: deducting },
    });

    pass.warnings.push(...result.warnings);
    pass.movements.push({
      lineId: line.id,
      articleId: line.articleId,
      quantity: quantityToString(result.delta),
    });
  }

  return pass;
}

/**
 * §6.5's completion preconditions, checked before anything is written.
 *
 * An out-odometer and at least one line. The out-odometer may come with the
 * request or already be on the order — a mechanic who typed it into the header
 * an hour ago should not have to type it again.
 */
function resolveOdometerOut(
  workOrder: WorkOrderRecord,
  input: ChangeWorkOrderStatusInput,
): number {
  const km = input.odometerKmOut ?? workOrder.odometerKmOut;
  if (km === null || km === undefined) {
    throw fieldError(
      'odometerKmOut',
      'Ange mätarställningen vid utlämning innan arbetsordern slutförs.',
    );
  }
  return km;
}

function auditActionFor(from: WorkOrderStatus, to: WorkOrderStatus): string {
  if (to === 'COMPLETED') {
    return 'work_order.completed';
  }
  return from === 'COMPLETED'
    ? 'work_order.reverted'
    : 'work_order.status_changed';
}

function assertHasLines(lines: readonly WorkOrderLineRecord[]): void {
  if (lines.length === 0) {
    throw new ConflictError(
      'Arbetsordern måste ha minst en rad innan den kan slutföras.',
    );
  }
}

/**
 * Changes a work order's status, with every side effect the move implies
 * (B6.5, B6.6).
 *
 * Runs inside the caller's transaction so that the stock movements, the
 * odometer reading, the audit row and — when the caller sent an
 * `Idempotency-Key` — the replay record all commit or all do not.
 */
export async function changeStatusInTransaction(
  tx: Prisma.TransactionClient,
  actorId: string,
  ipHash: string | null,
  id: string,
  input: ChangeWorkOrderStatusInput,
): Promise<WorkOrderResponse> {
  const before = await loadWorkOrder(tx, id);

  // The state machine first: a `409` naming what the order *could* do next is
  // more useful than one naming a missing odometer reading on a move that was
  // never legal in the first place.
  assertTransition(before.status, input.status);

  const lines = await loadLines(tx, id);
  const warnings: string[] = [];

  let odometerKmOut: number | null = before.odometerKmOut;
  let stock: StockPass = NO_STOCK_MOVED;

  if (input.status === 'COMPLETED') {
    assertHasLines(lines);
    odometerKmOut = resolveOdometerOut(before, input);

    // Articles are locked here, before the work-order row is touched below.
    stock = await moveStock(tx, before, lines, actorId, 'DEDUCT');
    warnings.push(...stock.warnings);

    if (odometerKmOut !== before.odometerKmOut) {
      warnings.push(
        ...(await recordWorkOrderOdometer(tx, {
          vehicleId: before.vehicleId,
          workOrderId: id,
          km: odometerKmOut,
          source: 'WORK_ORDER_OUT',
          userId: actorId,
        })),
      );
    }
  }

  if (before.status === 'COMPLETED') {
    stock = await moveStock(tx, before, lines, actorId, 'RETURN');
    warnings.push(...stock.warnings);
  }

  // §4.4: the number is spent the first time the order stops being an
  // abandonable draft, and never reassigned after that.
  const number = await assignNumberIfMissing(tx, before);

  await updateWithVersion(tx, id, input.version, {
    status: input.status,
    ...(number === null ? {} : { number }),
    ...(odometerKmOut === before.odometerKmOut ? {} : { odometerKmOut }),
    ...(input.status === 'COMPLETED'
      ? { completedAt: new Date(), completedByUserId: actorId }
      : {}),
    // Reverting clears the completion, so the fields always describe the
    // *current* state rather than the last time it happened to be finished.
    ...(before.status === 'COMPLETED'
      ? { completedAt: null, completedByUserId: null }
      : {}),
  });

  const after = await loadWorkOrder(tx, id);

  await writeAuditLog(tx, {
    userId: actorId,
    // Three actions rather than one. Completion and reversal both move stock
    // and both need to be findable on their own: "when did these parts go
    // back on the shelf, and who put them there" is the question the ledger
    // sends an auditor here to answer.
    action: auditActionFor(before.status, input.status),
    entityType: 'WorkOrder',
    entityId: id,
    before: auditSnapshot(before),
    after: {
      ...auditSnapshot(after),
      // What actually moved, not what could have: a re-completion after a
      // revert moves everything again, and a completion of an order whose
      // parts were already deducted moves nothing. The log has to be able to
      // tell those two apart.
      stockMovements: stock.movements,
    },
    ipHash,
  });

  return loadWorkOrderResponse(tx, id, warnings);
}
