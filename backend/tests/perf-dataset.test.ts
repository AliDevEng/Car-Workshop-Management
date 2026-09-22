import { describe, expect, it } from 'vitest';
import {
  isNormalisedRegNr,
  isNonStandardPlate,
  odometerKmSchema,
} from 'shared';
import {
  generatePerfDataset,
  PERF_VOLUMES,
  toQuantityString,
  type StockMovementRow,
} from '../perf/dataset.js';

/**
 * The B13.1 dataset's own invariants.
 *
 * Split out of `perf-stats.test.ts` because this file generates data and that
 * one does arithmetic — and because the generation is the expensive half.
 *
 * **The invariants are properties of the rules, not of the row count**, so they
 * are checked on a dataset a fiftieth of the size. At full volume the same
 * assertions saturated every core for half a minute and starved
 * `stock-ledger.test.ts`'s fifty parallel connections into a pool timeout: a
 * dataset generator breaking an unrelated concurrency test is not a trade
 * worth making for identical coverage. `PERF_VOLUMES` is asserted directly
 * below, and `perf:seed` reports the real counts on every run.
 */

describe('PERF_VOLUMES', () => {
  it('is exactly what B13.1.1 asks for', () => {
    // Against the plan's own numbers rather than against generated output:
    // this is the check that fails if somebody trims the dataset to make a
    // budget pass.
    expect(PERF_VOLUMES.customers).toBe(5_000);
    expect(PERF_VOLUMES.vehicles).toBe(8_000);
    expect(PERF_VOLUMES.workOrders).toBe(20_000);
    expect(PERF_VOLUMES.articles).toBe(2_000);
    expect(PERF_VOLUMES.stockMovements).toBe(200_000);
  });
});

describe('generatePerfDataset', () => {
  const SMALL = {
    customers: 100,
    vehicles: 160,
    articles: 40,
    workOrders: 400,
    stockMovements: 4_000,
    bookings: 120,
    bookingRequests: 60,
  } as const;

  const options = {
    now: new Date('2026-09-21T09:00:00.000Z'),
    userIds: ['user-a', 'user-b'],
    volumes: SMALL,
  } as const;

  const dataset = generatePerfDataset(options);

  it('honours the volumes it is given, derived rows included', () => {
    expect(dataset.customers).toHaveLength(SMALL.customers);
    expect(dataset.vehicles).toHaveLength(SMALL.vehicles);
    expect(dataset.articles).toHaveLength(SMALL.articles);
    expect(dataset.workOrders).toHaveLength(SMALL.workOrders);
    // The Sunday skip in `generateBookings` silently cost 424 of the 3 000
    // bookings the first time this ran, so the count is asserted rather than
    // assumed.
    expect(dataset.bookings).toHaveLength(SMALL.bookings);
    expect(dataset.bookingRequests).toHaveLength(SMALL.bookingRequests);
    expect(dataset.stockMovements.length).toBeGreaterThanOrEqual(
      SMALL.stockMovements,
    );
    expect(dataset.workOrderLines).toHaveLength(
      SMALL.workOrders * PERF_VOLUMES.linesPerWorkOrder,
    );
    expect(dataset.odometerReadings).toHaveLength(
      SMALL.vehicles * PERF_VOLUMES.odometerReadingsPerVehicle,
    );
  });

  it('is deterministic', () => {
    const again = generatePerfDataset(options);
    expect(again.customers[0]).toStrictEqual(dataset.customers[0]);
    expect(again.workOrders.at(-1)).toStrictEqual(dataset.workOrders.at(-1));
    expect(again.stockMovements.length).toBe(dataset.stockMovements.length);
  });

  it('gives every row a unique id, per table', () => {
    const unique = (ids: readonly string[]): number => new Set(ids).size;
    expect(unique(dataset.customers.map((row) => row.id))).toBe(
      dataset.customers.length,
    );
    expect(unique(dataset.vehicles.map((row) => row.id))).toBe(
      dataset.vehicles.length,
    );
    expect(unique(dataset.workOrders.map((row) => row.id))).toBe(
      dataset.workOrders.length,
    );
    expect(unique(dataset.stockMovements.map((row) => row.id))).toBe(
      dataset.stockMovements.length,
    );
    expect(unique(dataset.workOrderLines.map((row) => row.id))).toBe(
      dataset.workOrderLines.length,
    );
  });

  it('generates plates the unique index and shared/regnr.ts both accept', () => {
    const plates = dataset.vehicles.map((row) => row.registrationNumber);
    expect(new Set(plates).size).toBe(plates.length);

    // One assertion over the whole set rather than one per row: a failing
    // `expect` inside a loop of thousands names a row nobody can act on.
    const rejected = dataset.vehicles.filter(
      (vehicle) =>
        !isNormalisedRegNr(vehicle.registrationNumber) ||
        isNonStandardPlate(vehicle.registrationNumber) ||
        vehicle.isNonStandardPlate,
    );
    expect(rejected).toStrictEqual([]);
  });

  it('keeps ids ordered by creation, which every list paginates on', () => {
    const ids = dataset.workOrders.map((row) => row.id);
    expect([...ids].sort()).toStrictEqual(ids);
  });

  it('only generates values the API would itself have accepted', () => {
    // The dataset is written past the routes, so nothing but this checks it
    // against the contract. It was not hypothetical: 166 of 20 000 work orders
    // went negative, and `GET /api/work-orders?status=IN_PROGRESS` answered
    // `500` for them — the response schema refusing to serialise a row the
    // input schema would never have let in.
    const readings = [
      ...dataset.workOrders.map((order) => order.odometerKmIn),
      ...dataset.workOrders.flatMap((order) =>
        order.odometerKmOut === null ? [] : [order.odometerKmOut],
      ),
      ...dataset.odometerReadings.map((reading) => reading.km),
    ];
    const rejected = readings.filter(
      (km) => !odometerKmSchema.safeParse(km).success,
    );
    expect(rejected).toStrictEqual([]);
  });

  it('never reports an out reading below the in reading', () => {
    const backwards = dataset.workOrders.filter(
      (order) =>
        order.odometerKmOut !== null &&
        order.odometerKmOut < order.odometerKmIn,
    );
    expect(backwards).toStrictEqual([]);
  });

  it('never puts a work order on a vehicle its customer does not own', () => {
    const ownerOf = new Map(
      dataset.vehicles.map((vehicle) => [vehicle.id, vehicle.customerId]),
    );
    const mismatched = dataset.workOrders.filter(
      (order) => ownerOf.get(order.vehicleId) !== order.customerId,
    );
    expect(mismatched).toStrictEqual([]);
  });

  it('only claims stock was deducted on a completed order', () => {
    const statusOf = new Map(
      dataset.workOrders.map((order) => [order.id, order.status]),
    );
    const wrong = dataset.workOrderLines.filter(
      (line) =>
        line.stockDeducted &&
        (statusOf.get(line.workOrderId) !== 'COMPLETED' ||
          line.articleId === null),
    );
    expect(wrong).toStrictEqual([]);
  });

  it('writes a ledger whose balanceAfter is the running sum, never negative', () => {
    // Grouped by pushing into one array per article, not by rebuilding it:
    // `[...bucket, movement]` is quadratic and timed this test out at thirty
    // seconds the first time it ran at full volume.
    const byArticle = new Map<string, StockMovementRow[]>();
    for (const movement of dataset.stockMovements) {
      const bucket = byArticle.get(movement.articleId);
      if (bucket === undefined) {
        byArticle.set(movement.articleId, [movement]);
      } else {
        bucket.push(movement);
      }
    }

    const problems: string[] = [];
    for (const [articleId, movements] of byArticle) {
      let running = 0;
      for (const movement of movements) {
        running += Math.round(Number(movement.quantity) * 1000);
        if (movement.balanceAfter !== toQuantityString(running)) {
          problems.push(
            `${movement.id}: balanceAfter ${movement.balanceAfter}, expected ${toQuantityString(running)}`,
          );
        }
        if (running < 0) {
          problems.push(`${movement.id}: balance went negative`);
        }
      }
      // The cache column the seed derives in SQL must be this same final
      // balance, or `jobs/stock-reconciliation.ts` reports drift that is an
      // artefact of the seed rather than a fact about the code.
      if (
        dataset.articleBalances.get(articleId) !== toQuantityString(running)
      ) {
        problems.push(`${articleId}: cached balance disagrees with the ledger`);
      }
    }

    expect(problems).toStrictEqual([]);
  });

  it('matches every deducted part line with a CONSUMPTION movement', () => {
    const deducted = dataset.workOrderLines.filter(
      (line) => line.stockDeducted,
    );
    const consumptions = dataset.stockMovements.filter(
      (movement) => movement.workOrderId !== null,
    );
    // So a reconciliation sweep over this data finds no drift, which is what
    // makes B13.5.3's correctness question answerable at all.
    expect(consumptions).toHaveLength(deducted.length);
  });

  it('never overlaps two bookings for one mechanic (the §6.2 constraint)', () => {
    const byUser = new Map<string, { from: number; to: number }[]>();
    for (const booking of dataset.bookings) {
      const slots = byUser.get(booking.assignedUserId) ?? [];
      slots.push({
        from: booking.startsAt.getTime(),
        to: booking.endsAt.getTime(),
      });
      byUser.set(booking.assignedUserId, slots);
    }

    const overlaps: string[] = [];
    for (const [userId, slots] of byUser) {
      const sorted = [...slots].sort((left, right) => left.from - right.from);
      for (let index = 1; index < sorted.length; index += 1) {
        const previous = sorted[index - 1];
        const current = sorted[index];
        if (
          previous !== undefined &&
          current !== undefined &&
          current.from < previous.to
        ) {
          overlaps.push(`${userId} at ${new Date(current.from).toISOString()}`);
        }
      }
    }

    // An overlap here would fail the insert with SQLSTATE 23P01 halfway
    // through the seed — and the constraint would be right to refuse it.
    expect(overlaps).toStrictEqual([]);
  });

  it('mirrors the newest odometer reading into the vehicle cache column', () => {
    const newest = new Map<string, number>();
    for (const reading of dataset.odometerReadings) {
      const known = newest.get(reading.vehicleId);
      if (known === undefined || reading.km > known) {
        newest.set(reading.vehicleId, reading.km);
      }
    }
    const stale = dataset.vehicles.filter(
      (vehicle) => vehicle.lastKnownOdometerKm !== newest.get(vehicle.id),
    );
    expect(stale).toStrictEqual([]);
  });
});
