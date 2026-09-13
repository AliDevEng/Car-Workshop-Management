import { z } from 'zod';
import {
  stockholmDate,
  type PerformedService,
  type RecommendationSeverity,
  type RecommendationStatus,
  type ServiceRecommendation,
  type VehicleFacts,
} from 'shared';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  toIsoDateOrNull,
  toIsoDateTime,
  toIsoDateTimeOrNull,
} from '../../lib/dto-dates.js';
import type { Database } from '../../lib/prisma.js';

/**
 * Data access for service recommendations (PROJECT_SPEC.md §4.2, §7.3; B9.4).
 */

const serviceRecommendationFields = {
  id: true,
  vehicleId: true,
  serviceRuleId: true,
  ruleSnapshotJson: true,
  serviceType: true,
  dueKm: true,
  dueDate: true,
  severity: true,
  status: true,
  decidedByUserId: true,
  decidedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type ServiceRecommendationRecord =
  Prisma.ServiceRecommendationGetPayload<{
    select: typeof serviceRecommendationFields;
  }>;

export const SERVICE_RECOMMENDATION_SELECT = serviceRecommendationFields;

/**
 * Only the one field this module reads back out of the snapshot (B9.5.3).
 * Lenient on purpose — `.passthrough()` — because the snapshot is explicitly
 * allowed to gain fields over time (§7.3); this schema exists to narrow
 * `unknown` to "has a `sourceNote`", not to pin the whole shape.
 */
const ruleSnapshotSourceNoteSchema = z
  .object({ sourceNote: z.string() })
  .passthrough();

export function toServiceRecommendationDto(
  record: ServiceRecommendationRecord,
): ServiceRecommendation {
  return {
    id: record.id,
    vehicleId: record.vehicleId,
    serviceRuleId: record.serviceRuleId,
    ruleSnapshotJson: record.ruleSnapshotJson,
    sourceNote: ruleSnapshotSourceNoteSchema.parse(record.ruleSnapshotJson)
      .sourceNote,
    serviceType: record.serviceType,
    dueKm: record.dueKm,
    dueDate: toIsoDateOrNull(record.dueDate),
    severity: record.severity,
    status: record.status,
    decidedByUserId: record.decidedByUserId,
    decidedAt: toIsoDateTimeOrNull(record.decidedAt),
    createdAt: toIsoDateTime(record.createdAt),
    updatedAt: toIsoDateTime(record.updatedAt),
  };
}

export function findServiceRecommendationRecord(
  db: Database | Prisma.TransactionClient,
  id: string,
): Promise<ServiceRecommendationRecord | null> {
  return db.serviceRecommendation.findUnique({
    where: { id },
    select: serviceRecommendationFields,
  });
}

export type ListServiceRecommendationsOptions = {
  readonly limit: number;
  readonly cursor?: string | undefined;
  readonly vehicleId?: string | undefined;
  readonly status?: RecommendationStatus | undefined;
  readonly severity?: RecommendationSeverity | undefined;
};

export async function listServiceRecommendations(
  db: Database,
  options: ListServiceRecommendationsOptions,
): Promise<{ data: ServiceRecommendation[]; nextCursor: string | null }> {
  const rows = await db.serviceRecommendation.findMany({
    where: {
      ...(options.vehicleId === undefined
        ? {}
        : { vehicleId: options.vehicleId }),
      ...(options.status === undefined ? {} : { status: options.status }),
      ...(options.severity === undefined ? {} : { severity: options.severity }),
    },
    select: serviceRecommendationFields,
    orderBy: { id: 'desc' },
    take: options.limit + 1,
    ...(options.cursor === undefined
      ? {}
      : { cursor: { id: options.cursor }, skip: 1 }),
  });

  const page = rows.slice(0, options.limit);
  const nextCursor =
    rows.length > options.limit ? (page.at(-1)?.id ?? null) : null;

  return { data: page.map(toServiceRecommendationDto), nextCursor };
}

// --- Inputs to the matching engine (B9.6.1) ----------------------------------

export type VehicleMatchingFacts = {
  readonly facts: VehicleFacts;
  readonly odometerKm: number;
};

export async function loadVehicleFactsForMatching(
  db: Database | Prisma.TransactionClient,
  vehicleId: string,
): Promise<VehicleMatchingFacts | null> {
  const vehicle = await db.vehicle.findUnique({
    where: { id: vehicleId },
    select: {
      make: true,
      model: true,
      engineCode: true,
      modelYear: true,
      firstRegistrationDate: true,
      lastKnownOdometerKm: true,
    },
  });
  if (vehicle === null) {
    return null;
  }

  return {
    facts: {
      make: vehicle.make,
      model: vehicle.model,
      engineCode: vehicle.engineCode,
      modelYear: vehicle.modelYear,
      firstRegistrationDate: toIsoDateOrNull(vehicle.firstRegistrationDate),
    },
    odometerKm: vehicle.lastKnownOdometerKm ?? 0,
  };
}

/**
 * Every finalised service protocol for this vehicle, as the engine's
 * `PerformedService` history (§7.3, B9.3.1). A protocol that was corrected
 * (superseded) still describes work that was actually done on its
 * `performedAt`/`odometerKm`, so it stays in the history exactly like its
 * replacement — only `finalisedAt` gates inclusion, not `supersedesProtocolId`.
 *
 * `checklistTemplateId` is nullable at the database level (B8's `Restrict`
 * reasoning), but the application always sets it at creation; a row without
 * one cannot be attributed to a service type and is skipped rather than
 * guessed at.
 */
export async function loadPerformedServiceHistory(
  db: Database | Prisma.TransactionClient,
  vehicleId: string,
): Promise<PerformedService[]> {
  const protocols = await db.serviceProtocol.findMany({
    where: { workOrder: { vehicleId }, finalisedAt: { not: null } },
    select: {
      performedAt: true,
      odometerKm: true,
      checklistTemplate: { select: { serviceType: true } },
    },
  });

  return protocols
    .filter(
      (
        protocol,
      ): protocol is typeof protocol & {
        checklistTemplate: { serviceType: PerformedService['serviceType'] };
      } => protocol.checklistTemplate !== null,
    )
    .map((protocol) => ({
      serviceType: protocol.checklistTemplate.serviceType,
      // The Stockholm calendar date the work was performed on (§3.6), not the
      // raw UTC date of the timestamp — consistent with every other date the
      // engine compares against (`today` included; see `shared/service-rules.ts`).
      performedAt: stockholmDate(protocol.performedAt),
      odometerKm: protocol.odometerKm,
    }));
}
