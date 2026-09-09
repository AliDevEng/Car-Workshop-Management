import {
  ConflictError,
  NotFoundError,
  stockholmDate,
  type CreateWorkOrderInput,
  type UpdateWorkOrderInput,
  type WorkOrderDetail,
  type WorkOrderListResponse,
  type WorkOrderResponse,
} from 'shared';
import { writeAuditLog } from '../../lib/audit.js';
import {
  DOCUMENT_NUMBER_PREFIXES,
  nextDocumentNumber,
} from '../../lib/document-numbering.js';
import { fieldError } from '../../lib/field-error.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../lib/prisma.js';
import { assertAssignableUser } from '../bookings/assignment.js';
import { recordWorkOrderOdometer } from './odometer.js';
import {
  findWorkOrderDetailRecord,
  findWorkOrderRecord,
  listWorkOrders,
  toWorkOrderDetailDto,
  WORK_ORDER_SELECT,
  type ListWorkOrdersOptions,
  type WorkOrderRecord,
} from './repository.js';

/**
 * Work orders — the transactional heart of the system (PROJECT_SPEC.md §6.5,
 * B6.1, B6.3, B6.4, B6.7).
 *
 * This module owns the record and its header. Lines are `line.service.ts` and
 * status transitions — which deduct stock — are `status.service.ts`, because
 * those are the two places with side effects worth reading on their own.
 */

// --- Optimistic locking (B6.4) ----------------------------------------------

export const VERSION_CONFLICT_MESSAGE =
  'Arbetsordern har ändrats av någon annan sedan du öppnade den. Ladda om ' +
  'och försök igen.';

/**
 * Applies a header write only if the caller's `version` is still current.
 *
 * A read-then-write would be the check-then-act race CLAUDE.md's trap table
 * names: two mechanics both read version 3, both see it match, and the second
 * write silently wins. `updateMany` with the version in its `where` is one
 * atomic compare-and-swap — Postgres serialises the two on the row lock, and
 * the loser matches zero rows and is told so.
 *
 * The version is bumped by **every** write, including a line write, so a stale
 * header edit is still caught after someone else added a line (§6.5).
 *
 * `data` is the **unchecked** input on purpose: `updateMany` writes rows, not
 * an object graph, so it takes foreign keys as scalars and rejects relation
 * operations like `connect`/`disconnect` outright. Writing one anyway compiles
 * against the wrong overload and fails at runtime as a 500.
 */
export async function updateWithVersion(
  tx: Prisma.TransactionClient,
  id: string,
  version: number,
  data: Prisma.WorkOrderUncheckedUpdateManyInput,
): Promise<void> {
  const result = await tx.workOrder.updateMany({
    where: { id, version },
    data: { ...data, version: { increment: 1 } },
  });

  if (result.count === 0) {
    // Zero rows means one of two things and the caller deserves the right one:
    // the order is gone, or somebody else got there first.
    const current = await findWorkOrderRecord(tx, id);
    if (current === null) {
      throw new NotFoundError('Arbetsordern kunde inte hittas.');
    }
    throw new ConflictError(VERSION_CONFLICT_MESSAGE, {
      details: { version: current.version, status: current.status },
    });
  }
}

// --- Numbering (B6.1.2) ------------------------------------------------------

/**
 * Assigns `AO-2026-0001` the first time an order stops being a `DRAFT`.
 *
 * §4.4 assigns a number when a document is finalised rather than created, so
 * abandoned drafts leave no gaps — and §4.3 permits deleting a `DRAFT`
 * outright, which is exactly such a gap. Leaving `DRAFT` is that moment: from
 * then on the record is permanent, including a cancellation, which is itself
 * a thing the workshop may need to point at later.
 *
 * The year is the Europe/Stockholm one (§3.6). A job finalised at 00:30 on
 * 1 January belongs to the year the workshop is in, not to the one UTC is
 * still finishing.
 */
export async function assignNumberIfMissing(
  tx: Prisma.TransactionClient,
  record: WorkOrderRecord,
): Promise<string | null> {
  if (record.number !== null) {
    return null;
  }
  const year = Number(stockholmDate(new Date()).slice(0, 4));
  return nextDocumentNumber(tx, DOCUMENT_NUMBER_PREFIXES.WORK_ORDER, year);
}

// --- Shared helpers ----------------------------------------------------------

/** What the audit log records about a work order. */
export function auditSnapshot(
  record: WorkOrderRecord,
): Record<string, unknown> {
  return {
    number: record.number,
    status: record.status,
    vehicleId: record.vehicleId,
    customerId: record.customerId,
    assignedUserId: record.assignedUserId,
    description: record.description,
    odometerKmIn: record.odometerKmIn,
    odometerKmOut: record.odometerKmOut,
    version: record.version,
  };
}

/**
 * Loads the whole order for a response, after a write inside the same
 * transaction. Re-reading rather than assembling the answer from what was
 * written is deliberate: the totals have to come from the lines as they now
 * are, and a hand-assembled response is how a screen ends up disagreeing with
 * the database it just wrote to.
 */
export async function loadWorkOrderResponse(
  tx: Prisma.TransactionClient,
  id: string,
  warnings: readonly string[] = [],
): Promise<WorkOrderResponse> {
  const record = await findWorkOrderDetailRecord(tx, id);
  if (record === null) {
    throw new NotFoundError('Arbetsordern kunde inte hittas.');
  }
  return {
    workOrder: toWorkOrderDetailDto(record),
    warnings: [...warnings],
  };
}

/**
 * The work order a mutation is about, loaded inside the transaction.
 *
 * No `SELECT ... FOR UPDATE` here, and that is deliberate rather than an
 * omission: the header is guarded by the `version` compare-and-swap above,
 * which takes the row lock as part of the write. Locking on read would take
 * the work-order lock *before* the article locks that stock deduction needs,
 * inverting the order CLAUDE.md fixes to prevent deadlocks.
 */
export async function loadWorkOrder(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<WorkOrderRecord> {
  const record = await findWorkOrderRecord(tx, id);
  if (record === null) {
    throw new NotFoundError('Arbetsordern kunde inte hittas.');
  }
  return record;
}

// --- Reads -------------------------------------------------------------------

export async function getWorkOrder(
  db: Database,
  id: string,
): Promise<WorkOrderDetail> {
  const record = await findWorkOrderDetailRecord(db, id);
  if (record === null) {
    throw new NotFoundError('Arbetsordern kunde inte hittas.');
  }
  return toWorkOrderDetailDto(record);
}

export function getWorkOrders(
  db: Database,
  options: ListWorkOrdersOptions,
): Promise<WorkOrderListResponse> {
  return listWorkOrders(db, options);
}

// --- Creation (B6.1.3) -------------------------------------------------------

/**
 * The vehicle and customer a work order hangs off, checked together.
 *
 * A `400` rather than a `404`: the request is well formed and it is one field
 * in it that names something that does not exist. The vehicle's owner is *not*
 * required to be the given customer — a company car serviced on the driver's
 * account, or a car sold mid-job, are both real, and refusing them would send
 * a mechanic to the customer page to fix data before they can write down work
 * they have already done.
 */
async function assertVehicleAndCustomer(
  tx: Prisma.TransactionClient,
  vehicleId: string,
  customerId: string,
): Promise<void> {
  // Sequential, not `Promise.all`. A transaction client is a single
  // connection with one statement in flight, and issuing two queries on it at
  // once is what `pg` warns about; the two lookups are cheap and this is not
  // the hot path.
  const vehicle = await tx.vehicle.findUnique({
    where: { id: vehicleId },
    select: { id: true },
  });
  const customer = await tx.customer.findUnique({
    where: { id: customerId },
    select: { id: true },
  });

  if (vehicle === null) {
    throw fieldError('vehicleId', 'Fordonet kunde inte hittas.');
  }
  if (customer === null) {
    throw fieldError('customerId', 'Kunden kunde inte hittas.');
  }
}

async function assertBookingExists(
  tx: Prisma.TransactionClient,
  bookingId: string,
): Promise<void> {
  const booking = await tx.booking.findUnique({
    where: { id: bookingId },
    select: { id: true },
  });
  if (booking === null) {
    throw fieldError('bookingId', 'Bokningen kunde inte hittas.');
  }
}

/**
 * Creates a `DRAFT` work order, from a booking or standalone (B6.1.3).
 *
 * It starts as a `DRAFT` and without a number, and neither is negotiable:
 * §4.3 lets a draft be removed outright, and §4.4 will not spend a number on
 * something that might never happen.
 */
export async function createWorkOrder(
  db: Database,
  actorId: string,
  ipHash: string | null,
  input: CreateWorkOrderInput,
): Promise<WorkOrderResponse> {
  return db.$transaction(async (tx) => {
    await assertVehicleAndCustomer(tx, input.vehicleId, input.customerId);
    if (input.bookingId !== undefined) {
      await assertBookingExists(tx, input.bookingId);
    }
    if (input.assignedUserId !== undefined) {
      await assertAssignableUser(tx, input.assignedUserId);
    }

    const created = await tx.workOrder.create({
      data: {
        vehicleId: input.vehicleId,
        customerId: input.customerId,
        description: input.description,
        ...(input.bookingId === undefined
          ? {}
          : { bookingId: input.bookingId }),
        ...(input.assignedUserId === undefined
          ? {}
          : { assignedUserId: input.assignedUserId }),
        ...(input.internalNote === undefined
          ? {}
          : { internalNote: input.internalNote }),
        ...(input.odometerKmIn === undefined
          ? {}
          : { odometerKmIn: input.odometerKmIn }),
      },
      select: WORK_ORDER_SELECT,
    });

    // The arrival reading is history the vehicle keeps whatever happens to
    // this order (§4.2, B6.7.1).
    const warnings =
      input.odometerKmIn === undefined
        ? []
        : await recordWorkOrderOdometer(tx, {
            vehicleId: input.vehicleId,
            workOrderId: created.id,
            km: input.odometerKmIn,
            source: 'WORK_ORDER_IN',
            userId: actorId,
          });

    await writeAuditLog(tx, {
      userId: actorId,
      action: 'work_order.created',
      entityType: 'WorkOrder',
      entityId: created.id,
      after: auditSnapshot(created),
      ipHash,
    });

    return loadWorkOrderResponse(tx, created.id, warnings);
  });
}

// --- Header edits (B6.4.2) ---------------------------------------------------

/**
 * Edits the header, guarded by `version` (§6.5).
 *
 * `status` is deliberately not here: a transition has preconditions and side
 * effects, and folding it into a general patch would hide stock deduction
 * behind a field assignment. It is `changeWorkOrderStatus` instead.
 */
export async function updateWorkOrder(
  db: Database,
  actorId: string,
  ipHash: string | null,
  id: string,
  input: UpdateWorkOrderInput,
): Promise<WorkOrderResponse> {
  return db.$transaction(async (tx) => {
    const before = await loadWorkOrder(tx, id);

    if (typeof input.assignedUserId === 'string') {
      await assertAssignableUser(tx, input.assignedUserId);
    }

    await updateWithVersion(tx, id, input.version, {
      ...(input.description === undefined
        ? {}
        : { description: input.description }),
      ...(input.internalNote === undefined
        ? {}
        : { internalNote: input.internalNote }),
      ...(input.odometerKmIn === undefined
        ? {}
        : { odometerKmIn: input.odometerKmIn }),
      ...(input.odometerKmOut === undefined
        ? {}
        : { odometerKmOut: input.odometerKmOut }),
      // `undefined` leaves the mechanic alone, `null` unassigns, a string
      // reassigns — the three states the vehicle's owner relation uses.
      ...(input.assignedUserId === undefined
        ? {}
        : { assignedUserId: input.assignedUserId }),
    });

    // Both odometer fields are history as soon as they are set, whichever
    // route set them (B6.7.1). A value that did not change writes nothing —
    // saving the same form twice must not add a second reading.
    const warnings: string[] = [];
    if (
      input.odometerKmIn !== undefined &&
      input.odometerKmIn !== null &&
      input.odometerKmIn !== before.odometerKmIn
    ) {
      warnings.push(
        ...(await recordWorkOrderOdometer(tx, {
          vehicleId: before.vehicleId,
          workOrderId: id,
          km: input.odometerKmIn,
          source: 'WORK_ORDER_IN',
          userId: actorId,
        })),
      );
    }
    if (
      input.odometerKmOut !== undefined &&
      input.odometerKmOut !== null &&
      input.odometerKmOut !== before.odometerKmOut
    ) {
      warnings.push(
        ...(await recordWorkOrderOdometer(tx, {
          vehicleId: before.vehicleId,
          workOrderId: id,
          km: input.odometerKmOut,
          source: 'WORK_ORDER_OUT',
          userId: actorId,
        })),
      );
    }

    const after = await tx.workOrder.findUniqueOrThrow({
      where: { id },
      select: WORK_ORDER_SELECT,
    });

    await writeAuditLog(tx, {
      userId: actorId,
      action: 'work_order.updated',
      entityType: 'WorkOrder',
      entityId: id,
      before: auditSnapshot(before),
      after: auditSnapshot(after),
      ipHash,
    });

    return loadWorkOrderResponse(tx, id, warnings);
  });
}
