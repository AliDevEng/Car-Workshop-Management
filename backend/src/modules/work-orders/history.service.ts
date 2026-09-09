import { NotFoundError, type WorkOrderHistoryResponse } from 'shared';
import type { Database } from '../../lib/prisma.js';
import { listWorkOrderHistory } from './repository.js';

/**
 * Work-order history for a vehicle and for a customer (PROJECT_SPEC.md §6.3,
 * B6.8.1).
 *
 * The two are deliberately not the same query, and the difference is the whole
 * point of §6.3's "history hangs off the vehicle":
 *
 * - A **vehicle's** history is every job ever done on that car, regardless of
 *   who owned it at the time. Selling a car does not erase its cambelt change,
 *   and the next owner — and the service engine in B9 — needs to see it.
 * - A **customer's** history is the jobs billed to them, which do not follow a
 *   car they no longer own.
 *
 * Both filter on the work order's *own* foreign key rather than joining
 * through the current owner, which is what makes them survive a change of
 * ownership: the columns record who and what the job was for at the time.
 */

export type HistoryOptions = {
  readonly limit: number;
  readonly cursor?: string | undefined;
};

export async function listVehicleHistory(
  db: Database,
  vehicleId: string,
  options: HistoryOptions,
): Promise<WorkOrderHistoryResponse> {
  const vehicle = await db.vehicle.findUnique({
    where: { id: vehicleId },
    select: { id: true },
  });
  if (vehicle === null) {
    throw new NotFoundError('Fordonet kunde inte hittas.');
  }
  return listWorkOrderHistory(db, { vehicleId }, options);
}

export async function listCustomerHistory(
  db: Database,
  customerId: string,
  options: HistoryOptions,
): Promise<WorkOrderHistoryResponse> {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { id: true },
  });
  if (customer === null) {
    throw new NotFoundError('Kunden kunde inte hittas.');
  }
  return listWorkOrderHistory(db, { customerId }, options);
}
