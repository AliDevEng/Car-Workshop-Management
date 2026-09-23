import { ConflictError } from './errors.js';

/**
 * The work-order status state machine — PROJECT_SPEC.md §4.2 and §6.5.
 *
 * A single typed transition map, in `shared/`, rather than `if` statements
 * scattered through the routes: illegal transitions are rejected by the API,
 * not merely hidden in the UI, and the frontend can grey out the buttons that
 * would fail using exactly the same table.
 */

export const WORK_ORDER_STATUSES = [
  'DRAFT',
  'IN_PROGRESS',
  'AWAITING_PARTS',
  'READY_FOR_PICKUP',
  'COMPLETED',
  'CANCELLED',
] as const;

export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

/** Swedish labels for the interface and for error messages (§9.7). */
export const WORK_ORDER_STATUS_LABELS: Readonly<
  Record<WorkOrderStatus, string>
> = {
  DRAFT: 'Utkast',
  IN_PROGRESS: 'Pågår',
  AWAITING_PARTS: 'Väntar på delar',
  READY_FOR_PICKUP: 'Klar för upphämtning',
  COMPLETED: 'Slutförd',
  CANCELLED: 'Avbruten',
};

/**
 * Every legal move. Four decisions here are deliberate and easy to get wrong
 * later, so they are written down rather than inferred from the table:
 *
 * 1. `DRAFT` cannot jump straight to `COMPLETED`. Completion deducts stock and
 *    requires an out-odometer and at least one line (§6.5); a draft has been
 *    through none of that.
 * 2. `COMPLETED` reverts only to `IN_PROGRESS`, never to `CANCELLED` directly.
 *    Reverting is what writes the compensating `RETURN` stock movements
 *    (B6.6.4); routing a cancellation through `IN_PROGRESS` forces it down
 *    that same path instead of leaving deducted parts unaccounted for.
 * 3. `CANCELLED` is terminal. §4.3 allows deleting only a `DRAFT` work order,
 *    so a cancelled one stays as the historical record it is; reopening means
 *    creating a new order that can reference it.
 * 4. A status cannot transition to itself. It reads as harmless, but it would
 *    let a double-tapped `Slutför` run the completion side effects twice —
 *    guarded by `stockDeducted` (§6.4), but there is no reason to lean on that
 *    guard when the state machine can simply say no.
 */
const TRANSITIONS: Readonly<
  Record<WorkOrderStatus, readonly WorkOrderStatus[]>
> = {
  DRAFT: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['AWAITING_PARTS', 'READY_FOR_PICKUP', 'COMPLETED', 'CANCELLED'],
  AWAITING_PARTS: ['IN_PROGRESS', 'READY_FOR_PICKUP', 'CANCELLED'],
  READY_FOR_PICKUP: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  COMPLETED: ['IN_PROGRESS'],
  CANCELLED: [],
};

/** The statuses reachable from `from`, for the API and for the UI. */
export function allowedTransitions(
  from: WorkOrderStatus,
): readonly WorkOrderStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(
  from: WorkOrderStatus,
  to: WorkOrderStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

/** No move leaves this status. Nothing further can happen to the order. */
export function isTerminalStatus(status: WorkOrderStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/**
 * The order's content is frozen: lines, description and odometer readings
 * can no longer be written.
 *
 * Deliberately **not** {@link isTerminalStatus}. That answers "can this
 * status move anywhere", which is false for `CANCELLED` but *true* for
 * `COMPLETED` — a completed order can still revert to `IN_PROGRESS`. The
 * backend's own line lock (`bumpVersionForLineWrite`'s `status: { notIn }`
 * guard) is this exact pair, and the screen must match it rather than a
 * same-shaped but differently-meant helper. It lives here so the lock is
 * stated once for both sides instead of being re-derived per component.
 */
export function isWorkOrderLocked(status: WorkOrderStatus): boolean {
  return status === 'COMPLETED' || status === 'CANCELLED';
}

/**
 * Throws a `ConflictError` when the move is illegal. `409` is the right answer:
 * the request is well-formed, but the order is not in a state that allows it.
 *
 * `details.allowed` lets the client show what it *could* do instead, rather
 * than only that it failed.
 */
export function assertTransition(
  from: WorkOrderStatus,
  to: WorkOrderStatus,
): void {
  if (canTransition(from, to)) {
    return;
  }

  const fromLabel = WORK_ORDER_STATUS_LABELS[from];
  const toLabel = WORK_ORDER_STATUS_LABELS[to];

  throw new ConflictError(
    `Det går inte att ändra status från ${fromLabel} till ${toLabel}.`,
    { details: { from, to, allowed: allowedTransitions(from) } },
  );
}
