import type { OdometerSource } from 'shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { recordOdometerReadingInTransaction } from '../vehicles/odometer.service.js';

/**
 * Arrival and departure mileage (PROJECT_SPEC.md §3.5, §4.2; B6.7).
 *
 * A work order stores what the car showed when it arrived and when it left,
 * and **both are also written to `OdometerReading`** — the history is the
 * record and the columns on the order are its own copy of it (§4.2). The
 * service engine's baseline in B9 reads the history, so a reading that only
 * ever existed as a work-order column would be invisible to it.
 *
 * The B3.3 warning — a reading below the vehicle's previous highest — comes
 * back with it and reaches the UI on the successful response (B6.7.2). It is
 * never an error: a cluster gets replaced, and refusing the number would leave
 * a mechanic unable to record what the car actually shows.
 */
export type WorkOrderOdometerCapture = {
  readonly vehicleId: string;
  readonly workOrderId: string;
  readonly km: number;
  readonly source: Extract<OdometerSource, 'WORK_ORDER_IN' | 'WORK_ORDER_OUT'>;
  readonly userId: string;
};

export async function recordWorkOrderOdometer(
  tx: Prisma.TransactionClient,
  capture: WorkOrderOdometerCapture,
): Promise<string[]> {
  const result = await recordOdometerReadingInTransaction(tx, {
    vehicleId: capture.vehicleId,
    km: capture.km,
    source: capture.source,
    userId: capture.userId,
    workOrderId: capture.workOrderId,
  });
  return result.warnings;
}
