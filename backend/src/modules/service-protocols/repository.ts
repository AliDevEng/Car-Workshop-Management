import { z } from 'zod';
import {
  checklistAnswerSchema,
  type ChecklistAnswer,
  type ServiceProtocol,
  type ServiceProtocolDetail,
  type ServiceProtocolListItem,
} from 'shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../lib/prisma.js';
import {
  toIsoDateOrNull,
  toIsoDateTime,
  toIsoDateTimeOrNull,
} from '../../lib/dto-dates.js';

/**
 * Data access for service protocols (PROJECT_SPEC.md §4.2, §6.7, §8.2; B8.2).
 *
 * Every function returns a plain DTO, never a Prisma model. `checklistJson` is
 * a `Json` column and reaches this module as `Prisma.JsonValue` — a claim
 * about its shape until something checks it, exactly like `Document.payloadJson`
 * and `ChecklistTemplate.itemsJson`. It is parsed through the same `shared`
 * schema the write path validates against.
 */

const serviceProtocolFields = {
  id: true,
  workOrderId: true,
  number: true,
  revision: true,
  supersedesProtocolId: true,
  performedAt: true,
  odometerKm: true,
  performedByUserId: true,
  checklistTemplateId: true,
  checklistJson: true,
  nextServiceDueKm: true,
  nextServiceDueDate: true,
  notes: true,
  documentId: true,
  finalisedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const relationFields = {
  workOrder: {
    select: {
      id: true,
      number: true,
      customer: { select: { id: true, type: true, name: true, phone: true } },
      vehicle: {
        select: {
          id: true,
          registrationNumber: true,
          registrationNumberDisplay: true,
          make: true,
          model: true,
        },
      },
    },
  },
  performedBy: { select: { id: true, name: true, role: true } },
} as const;

const serviceProtocolDetailFields = {
  ...serviceProtocolFields,
  ...relationFields,
} as const;

export type ServiceProtocolRecord = Prisma.ServiceProtocolGetPayload<{
  select: typeof serviceProtocolFields;
}>;

export type ServiceProtocolDetailRecord = Prisma.ServiceProtocolGetPayload<{
  select: typeof serviceProtocolDetailFields;
}>;

export const SERVICE_PROTOCOL_SELECT = serviceProtocolFields;
export const SERVICE_PROTOCOL_DETAIL_SELECT = serviceProtocolDetailFields;

const checklistSchema = z.array(checklistAnswerSchema);

export function toChecklist(value: unknown): ChecklistAnswer[] {
  return checklistSchema.parse(value);
}

export function toServiceProtocolDto(
  record: ServiceProtocolRecord,
): ServiceProtocol {
  return {
    id: record.id,
    workOrderId: record.workOrderId,
    number: record.number,
    revision: record.revision,
    supersedesProtocolId: record.supersedesProtocolId,
    performedAt: toIsoDateTime(record.performedAt),
    odometerKm: record.odometerKm,
    performedByUserId: record.performedByUserId,
    checklistTemplateId: record.checklistTemplateId,
    checklist: toChecklist(record.checklistJson),
    nextServiceDueKm: record.nextServiceDueKm,
    nextServiceDueDate: toIsoDateOrNull(record.nextServiceDueDate),
    notes: record.notes,
    documentId: record.documentId,
    finalisedAt: toIsoDateTimeOrNull(record.finalisedAt),
    createdAt: toIsoDateTime(record.createdAt),
    updatedAt: toIsoDateTime(record.updatedAt),
  };
}

function toRelationsDto(record: ServiceProtocolDetailRecord): {
  customer: ServiceProtocolDetail['customer'];
  vehicle: ServiceProtocolDetail['vehicle'];
  performedBy: ServiceProtocolDetail['performedBy'];
} {
  return {
    customer: {
      id: record.workOrder.customer.id,
      type: record.workOrder.customer.type,
      name: record.workOrder.customer.name,
      phone: record.workOrder.customer.phone,
    },
    vehicle: {
      id: record.workOrder.vehicle.id,
      registrationNumber: record.workOrder.vehicle.registrationNumber,
      registrationNumberDisplay:
        record.workOrder.vehicle.registrationNumberDisplay,
      make: record.workOrder.vehicle.make,
      model: record.workOrder.vehicle.model,
    },
    performedBy: record.performedBy,
  };
}

export function toServiceProtocolDetailDto(
  record: ServiceProtocolDetailRecord,
): ServiceProtocolDetail {
  return {
    ...toServiceProtocolDto(record),
    ...toRelationsDto(record),
    workOrderNumber: record.workOrder.number,
  };
}

function toServiceProtocolListItemDto(
  record: ServiceProtocolDetailRecord,
): ServiceProtocolListItem {
  return {
    ...toServiceProtocolDto(record),
    ...toRelationsDto(record),
  };
}

// --- Reads -------------------------------------------------------------------

export function findServiceProtocolRecord(
  db: Database | Prisma.TransactionClient,
  id: string,
): Promise<ServiceProtocolRecord | null> {
  return db.serviceProtocol.findUnique({
    where: { id },
    select: serviceProtocolFields,
  });
}

export function findServiceProtocolDetailRecord(
  db: Database | Prisma.TransactionClient,
  id: string,
): Promise<ServiceProtocolDetailRecord | null> {
  return db.serviceProtocol.findUnique({
    where: { id },
    select: serviceProtocolDetailFields,
  });
}

export type ListServiceProtocolsOptions = {
  readonly limit: number;
  readonly cursor?: string | undefined;
  readonly workOrderId?: string | undefined;
  readonly finalised?: boolean | undefined;
};

/**
 * Cursor pagination on `id DESC` — a UUIDv7, unique and monotonic by creation
 * time, mirroring `quotes/repository.ts#listQuotes`. `number` is not the sort
 * key: it is null before finalisation, and sorting on a nullable column would
 * put every unfinalised protocol at one end of the list.
 */
export async function listServiceProtocols(
  db: Database,
  options: ListServiceProtocolsOptions,
): Promise<{ data: ServiceProtocolListItem[]; nextCursor: string | null }> {
  const rows = await db.serviceProtocol.findMany({
    where: {
      ...(options.workOrderId === undefined
        ? {}
        : { workOrderId: options.workOrderId }),
      ...(options.finalised === undefined
        ? {}
        : options.finalised
          ? { finalisedAt: { not: null } }
          : { finalisedAt: null }),
    },
    select: serviceProtocolDetailFields,
    orderBy: { id: 'desc' },
    take: options.limit + 1,
    ...(options.cursor === undefined
      ? {}
      : { cursor: { id: options.cursor }, skip: 1 }),
  });

  const page = rows.slice(0, options.limit);
  const nextCursor =
    rows.length > options.limit ? (page.at(-1)?.id ?? null) : null;

  return { data: page.map(toServiceProtocolListItemDto), nextCursor };
}
