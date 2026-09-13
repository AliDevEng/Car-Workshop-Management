import {
  NotFoundError,
  computeRecommendations,
  type DecideRecommendationInput,
  type ServiceRecommendation,
  type ServiceRecommendationListResponse,
} from 'shared';
import { loadActiveServiceRuleFacts } from '../service-rules/repository.js';
import { writeAuditLog } from '../../lib/audit.js';
import { toDateColumn } from '../../lib/date-column.js';
import { toIsoDateOrNull, toIsoDateTimeOrNull } from '../../lib/dto-dates.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../lib/prisma.js';
import {
  findServiceRecommendationRecord,
  listServiceRecommendations,
  loadPerformedServiceHistory,
  loadVehicleFactsForMatching,
  toServiceRecommendationDto,
  type ListServiceRecommendationsOptions,
  type ServiceRecommendationRecord,
} from './repository.js';

/**
 * Service recommendations (PROJECT_SPEC.md §4.2, §7.3; B9.4–B9.6).
 *
 * Three rules hold this module together, each already fixed by §7.3 and by
 * the Prisma model's own comment:
 *
 * 1. **Recomputation never invents a decision.** A freshly computed
 *    recommendation starts `SUGGESTED`; an existing row's `status`,
 *    `decidedByUserId` and `decidedAt` are left exactly as they are (B9.6.4).
 * 2. **One row per `(vehicleId, serviceType)`.** Recomputing updates that row
 *    in place rather than creating a second one (B9.4.3).
 * 3. **Advice that no longer holds is removed, whatever its decision state.**
 *    A serviced car, a lengthened interval or a deactivated rule can all make
 *    a service type fall out of every tracked window; the row describing it
 *    is deleted rather than left stale, because a human reading it cannot
 *    otherwise tell "still true" from "computed once, never revisited".
 */

const RECOMMENDATION_NOT_FOUND = 'Rekommendationen kunde inte hittas.';
const VEHICLE_NOT_FOUND = 'Fordonet kunde inte hittas.';

function auditSnapshot(
  record: ServiceRecommendationRecord,
): Record<string, unknown> {
  return {
    vehicleId: record.vehicleId,
    serviceType: record.serviceType,
    dueKm: record.dueKm,
    dueDate: toIsoDateOrNull(record.dueDate),
    severity: record.severity,
    status: record.status,
    decidedByUserId: record.decidedByUserId,
    decidedAt: toIsoDateTimeOrNull(record.decidedAt),
  };
}

/**
 * Recomputes every recommendation for one vehicle, inside the caller's
 * transaction (B9.4.2, B9.6.1) — the odometer-reading and work-order
 * completion paths both call this as part of their own atomic unit, the same
 * way `recordOdometerReadingInTransaction` composes into B6's completion
 * transaction rather than opening a nested one.
 */
export async function recomputeRecommendationsForVehicleInTransaction(
  tx: Prisma.TransactionClient,
  vehicleId: string,
  today: Date = new Date(),
): Promise<void> {
  const loaded = await loadVehicleFactsForMatching(tx, vehicleId);
  if (loaded === null) {
    throw new NotFoundError(VEHICLE_NOT_FOUND);
  }

  // Sequential, not `Promise.all`: a Prisma interactive transaction runs on
  // one reserved connection, and firing independent queries concurrently over
  // it races on that single connection rather than actually parallelising —
  // `pg` logs exactly this ("query() when the client is already executing a
  // query") and the result is queries silently reading stale or inconsistent
  // state, not a thrown error announcing the problem.
  const history = await loadPerformedServiceHistory(tx, vehicleId);
  const rules = await loadActiveServiceRuleFacts(tx);
  const existingRows = await tx.serviceRecommendation.findMany({
    where: { vehicleId },
    select: { id: true, serviceType: true },
  });

  const computed = computeRecommendations({
    vehicle: loaded.facts,
    odometerKm: loaded.odometerKm,
    today,
    history,
    rules,
  });

  const touchedTypes = new Set(computed.map((rec) => rec.serviceType));

  for (const rec of computed) {
    const data = {
      serviceRuleId: rec.serviceRuleId,
      // `ServiceRuleFacts` is a plain, JSON-serialisable object — the exact
      // shape the matching engine used, frozen at the moment of computation
      // (§7.3). Editing the rule afterwards must never rewrite this.
      ruleSnapshotJson: rec.ruleSnapshot,
      dueKm: rec.dueKm,
      dueDate: rec.dueDate === null ? null : toDateColumn(rec.dueDate),
      severity: rec.severity,
    };

    // `update` only ever names the fields above, so an existing row's
    // `status`/`decidedByUserId`/`decidedAt` are left untouched — Prisma does
    // not clear a column it was not told to change.
    await tx.serviceRecommendation.upsert({
      where: {
        vehicleId_serviceType: { vehicleId, serviceType: rec.serviceType },
      },
      create: {
        vehicleId,
        serviceType: rec.serviceType,
        status: 'SUGGESTED',
        ...data,
      },
      update: data,
    });
  }

  const staleIds = existingRows
    .filter((row) => !touchedTypes.has(row.serviceType))
    .map((row) => row.id);
  if (staleIds.length > 0) {
    await tx.serviceRecommendation.deleteMany({
      where: { id: { in: staleIds } },
    });
  }
}

/** The standalone entry point, for callers outside an existing transaction. */
export function recomputeRecommendationsForVehicle(
  db: Database,
  vehicleId: string,
  today?: Date,
): Promise<void> {
  return db.$transaction((tx) =>
    recomputeRecommendationsForVehicleInTransaction(tx, vehicleId, today),
  );
}

export async function getServiceRecommendation(
  db: Database,
  id: string,
): Promise<ServiceRecommendation> {
  const record = await findServiceRecommendationRecord(db, id);
  if (record === null) {
    throw new NotFoundError(RECOMMENDATION_NOT_FOUND);
  }
  return toServiceRecommendationDto(record);
}

export function getServiceRecommendations(
  db: Database,
  options: ListServiceRecommendationsOptions,
): Promise<ServiceRecommendationListResponse> {
  return listServiceRecommendations(db, options);
}

/** B9.6.2 — the vehicle-detail view's own slice of the general list endpoint. */
export async function getVehicleServiceRecommendations(
  db: Database,
  vehicleId: string,
  options: { readonly limit: number; readonly cursor?: string | undefined },
): Promise<ServiceRecommendationListResponse> {
  const vehicle = await db.vehicle.findUnique({
    where: { id: vehicleId },
    select: { id: true },
  });
  if (vehicle === null) {
    throw new NotFoundError(VEHICLE_NOT_FOUND);
  }

  return listServiceRecommendations(db, { ...options, vehicleId });
}

/**
 * Accept or dismiss a recommendation (B9.5.1). Never creates a work-order
 * line by itself, accept included — §7.3's safeguard is that a human decision
 * is *recorded*, not automated; turning an accepted recommendation into a line
 * is a separate, explicit action a mechanic takes in the work-order or
 * protocol screen (B9.5.2, B9.6.3).
 */
export async function decideServiceRecommendation(
  db: Database,
  actorId: string,
  ipHash: string | null,
  id: string,
  input: DecideRecommendationInput,
): Promise<ServiceRecommendation> {
  return db.$transaction(async (tx) => {
    const before = await findServiceRecommendationRecord(tx, id);
    if (before === null) {
      throw new NotFoundError(RECOMMENDATION_NOT_FOUND);
    }

    await tx.serviceRecommendation.update({
      where: { id },
      data: {
        status: input.status,
        decidedByUserId: actorId,
        decidedAt: new Date(),
      },
    });

    const after = await findServiceRecommendationRecord(tx, id);
    if (after === null) {
      throw new NotFoundError(RECOMMENDATION_NOT_FOUND);
    }

    await writeAuditLog(tx, {
      userId: actorId,
      action:
        input.status === 'ACCEPTED'
          ? 'service_recommendation.accepted'
          : 'service_recommendation.dismissed',
      entityType: 'ServiceRecommendation',
      entityId: id,
      before: auditSnapshot(before),
      after: auditSnapshot(after),
      ipHash,
    });

    return toServiceRecommendationDto(after);
  });
}
