import {
  INSPECTION_DUE_WINDOW_DAYS,
  normaliseRegNr,
  stockholmDate,
} from 'shared';
import type { Vehicle, VehicleDetail, VehicleSummary } from 'shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../lib/prisma.js';
import {
  toIsoDateOrNull,
  toIsoDateTime,
  toIsoDateTimeOrNull,
} from '../../lib/dto-dates.js';

/**
 * Data access for vehicles (PROJECT_SPEC.md §4.2, §6.3).
 *
 * The vehicle is the spine of the system: history hangs off it, so an owner
 * can change without anything being lost. Every function returns a DTO, never
 * a Prisma model (§8.2) — the `date` columns become `YYYY-MM-DD` and the
 * `timestamptz` ones a full instant.
 */

const vehicleFields = {
  id: true,
  registrationNumber: true,
  registrationNumberDisplay: true,
  isNonStandardPlate: true,
  customerId: true,
  make: true,
  model: true,
  variant: true,
  modelYear: true,
  vin: true,
  engineCode: true,
  fuelType: true,
  firstRegistrationDate: true,
  lastInspectionDate: true,
  nextInspectionDueDate: true,
  lastKnownOdometerKm: true,
  dataFetchedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const customerSummarySelect = {
  id: true,
  type: true,
  name: true,
  phone: true,
} as const;

export type VehicleRecord = Prisma.VehicleGetPayload<{
  select: typeof vehicleFields;
}>;

export type VehicleWithCustomerRecord = Prisma.VehicleGetPayload<{
  select: typeof vehicleFields & {
    customer: { select: typeof customerSummarySelect };
  };
}>;

export function toVehicleDto(record: VehicleRecord): Vehicle {
  return {
    id: record.id,
    registrationNumber: record.registrationNumber,
    registrationNumberDisplay: record.registrationNumberDisplay,
    isNonStandardPlate: record.isNonStandardPlate,
    customerId: record.customerId,
    make: record.make,
    model: record.model,
    variant: record.variant,
    modelYear: record.modelYear,
    vin: record.vin,
    engineCode: record.engineCode,
    fuelType: record.fuelType,
    firstRegistrationDate: toIsoDateOrNull(record.firstRegistrationDate),
    lastInspectionDate: toIsoDateOrNull(record.lastInspectionDate),
    nextInspectionDueDate: toIsoDateOrNull(record.nextInspectionDueDate),
    lastKnownOdometerKm: record.lastKnownOdometerKm,
    dataFetchedAt: toIsoDateTimeOrNull(record.dataFetchedAt),
    createdAt: toIsoDateTime(record.createdAt),
    updatedAt: toIsoDateTime(record.updatedAt),
  };
}

export function toVehicleDetailDto(
  record: VehicleWithCustomerRecord,
): VehicleDetail {
  const { customer } = record;
  return {
    ...toVehicleDto(record),
    customer:
      customer === null
        ? null
        : {
            id: customer.id,
            type: customer.type,
            name: customer.name,
            phone: customer.phone,
          },
  };
}

export function toVehicleSummaryDto(record: VehicleRecord): VehicleSummary {
  return {
    id: record.id,
    registrationNumber: record.registrationNumber,
    registrationNumberDisplay: record.registrationNumberDisplay,
    make: record.make,
    model: record.model,
  };
}

/**
 * The `?q=` predicate shared by the vehicle list and the global search
 * (B3.4). The query is normalised for the canonical column — the form the
 * unique index lives on — and matched as typed against the display, make and
 * model. LIKE metacharacters are stripped, as in the customer predicate.
 */
export function vehicleSearchWhere(term: string): Prisma.VehicleWhereInput {
  const cleaned = term.replace(/[\\%_]/g, ' ').trim();
  if (cleaned === '') {
    return { id: { in: [] } };
  }

  const or: Prisma.VehicleWhereInput[] = [
    { registrationNumberDisplay: { contains: cleaned, mode: 'insensitive' } },
    { make: { contains: cleaned, mode: 'insensitive' } },
    { model: { contains: cleaned, mode: 'insensitive' } },
  ];

  const normalisedRegNr = normaliseRegNr(cleaned);
  if (normalisedRegNr.length >= 2) {
    or.push({
      registrationNumber: { contains: normalisedRegNr, mode: 'insensitive' },
    });
  }

  return { OR: or };
}

/**
 * "Inspection due within 60 days", reaching backwards as well as forwards —
 * the same window the dashboard's attention card uses (§6.8, B6.8.2), kept as
 * one definition rather than two so the count and the list never disagree
 * about what "due soon" means. `nextInspectionDueDate` is a `date` column, so
 * both bounds are UTC midnights — a calendar date, not an instant.
 */
export function inspectionDueSoonWhere(today: string): Prisma.VehicleWhereInput {
  const midnight = (offsetDays: number): Date => {
    const date = new Date(`${today}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + offsetDays);
    return date;
  };

  return {
    nextInspectionDueDate: {
      not: null,
      gte: midnight(-INSPECTION_DUE_WINDOW_DAYS),
      lte: midnight(INSPECTION_DUE_WINDOW_DAYS),
    },
  };
}

export type ListVehiclesOptions = {
  readonly limit: number;
  readonly cursor?: string | undefined;
  readonly q?: string | undefined;
  readonly customerId?: string | undefined;
  readonly inspectionDueSoon?: boolean | undefined;
};

export async function listVehicles(
  db: Database,
  options: ListVehiclesOptions,
): Promise<{ data: Vehicle[]; nextCursor: string | null }> {
  const where: Prisma.VehicleWhereInput = {
    ...(options.customerId === undefined
      ? {}
      : { customerId: options.customerId }),
    ...(options.q === undefined ? {} : vehicleSearchWhere(options.q)),
    ...(options.inspectionDueSoon === true
      ? inspectionDueSoonWhere(stockholmDate(new Date()))
      : {}),
  };

  const rows = await db.vehicle.findMany({
    where,
    select: vehicleFields,
    orderBy: { id: 'desc' },
    take: options.limit + 1,
    ...(options.cursor === undefined
      ? {}
      : { cursor: { id: options.cursor }, skip: 1 }),
  });

  const page = rows.slice(0, options.limit);
  const nextCursor =
    rows.length > options.limit ? (page.at(-1)?.id ?? null) : null;

  return { data: page.map(toVehicleDto), nextCursor };
}

export function findVehicleRecord(
  db: Database,
  id: string,
): Promise<VehicleRecord | null> {
  return db.vehicle.findUnique({ where: { id }, select: vehicleFields });
}

export function findVehicleWithCustomer(
  db: Database,
  id: string,
): Promise<VehicleWithCustomerRecord | null> {
  return db.vehicle.findUnique({
    where: { id },
    select: { ...vehicleFields, customer: { select: customerSummarySelect } },
  });
}

export function findVehicleByRegistrationNumber(
  db: Database,
  registrationNumber: string,
): Promise<VehicleWithCustomerRecord | null> {
  return db.vehicle.findUnique({
    where: { registrationNumber },
    select: { ...vehicleFields, customer: { select: customerSummarySelect } },
  });
}

export const VEHICLE_SELECT = vehicleFields;
