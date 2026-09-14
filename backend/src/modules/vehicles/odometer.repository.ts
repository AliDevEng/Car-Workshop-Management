import type { OdometerReading, OdometerSource } from 'shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../lib/prisma.js';
import { toIsoDateTime } from '../../lib/dto-dates.js';

/**
 * Data access for odometer history (PROJECT_SPEC.md §4.2, §3.5).
 *
 * The history table is the record; `Vehicle.lastKnownOdometerKm` is a cache of
 * the newest reading kept beside it so a list does not need a subquery.
 */

const odometerFields = {
  id: true,
  vehicleId: true,
  km: true,
  readAt: true,
  source: true,
  userId: true,
  workOrderId: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Exported so the GDPR export (B11.2.1) can select the same shape. */
export const ODOMETER_READING_SELECT = odometerFields;

export type OdometerReadingRecord = Prisma.OdometerReadingGetPayload<{
  select: typeof odometerFields;
}>;

export function toOdometerReadingDto(
  record: OdometerReadingRecord,
): OdometerReading {
  return {
    id: record.id,
    vehicleId: record.vehicleId,
    km: record.km,
    readAt: toIsoDateTime(record.readAt),
    source: record.source,
    userId: record.userId,
    workOrderId: record.workOrderId,
    createdAt: toIsoDateTime(record.createdAt),
    updatedAt: toIsoDateTime(record.updatedAt),
  };
}

/** The highest km ever recorded for a vehicle, or `null` if it has none. */
export async function highestRecordedKm(
  db: Database | Prisma.TransactionClient,
  vehicleId: string,
): Promise<number | null> {
  const result = await db.odometerReading.aggregate({
    where: { vehicleId },
    _max: { km: true },
  });
  return result._max.km;
}

/**
 * The km of the chronologically newest reading — `readAt` first, then km as a
 * tiebreaker for two readings on the same day. This is what the cache mirrors.
 */
export async function newestReadingKm(
  db: Database | Prisma.TransactionClient,
  vehicleId: string,
): Promise<number | null> {
  const row = await db.odometerReading.findFirst({
    where: { vehicleId },
    orderBy: [{ readAt: 'desc' }, { km: 'desc' }],
    select: { km: true },
  });
  return row?.km ?? null;
}

export type InsertReadingInput = {
  readonly vehicleId: string;
  readonly km: number;
  readonly readAt: Date;
  readonly source: OdometerSource;
  readonly userId: string | null;
  /** Set when the reading came from a work order's in or out capture (B6.7). */
  readonly workOrderId?: string | null;
};

export function insertReading(
  db: Database | Prisma.TransactionClient,
  input: InsertReadingInput,
): Promise<OdometerReadingRecord> {
  return db.odometerReading.create({
    data: {
      vehicleId: input.vehicleId,
      km: input.km,
      readAt: input.readAt,
      source: input.source,
      userId: input.userId,
      workOrderId: input.workOrderId ?? null,
    },
    select: odometerFields,
  });
}

export type ListReadingsOptions = {
  readonly limit: number;
  readonly cursor?: string | undefined;
};

/**
 * Newest-entered first, cursor-paginated on `id DESC`. The id is a UUIDv7, so
 * it is unique and monotonic by insertion time; a backdated `readAt` is a
 * display concern the frontend sorts on, not a cursor key (§8.1).
 */
export async function listReadings(
  db: Database,
  vehicleId: string,
  options: ListReadingsOptions,
): Promise<{ data: OdometerReading[]; nextCursor: string | null }> {
  const rows = await db.odometerReading.findMany({
    where: { vehicleId },
    select: odometerFields,
    orderBy: { id: 'desc' },
    take: options.limit + 1,
    ...(options.cursor === undefined
      ? {}
      : { cursor: { id: options.cursor }, skip: 1 }),
  });

  const page = rows.slice(0, options.limit);
  const nextCursor =
    rows.length > options.limit ? (page.at(-1)?.id ?? null) : null;

  return { data: page.map(toOdometerReadingDto), nextCursor };
}
