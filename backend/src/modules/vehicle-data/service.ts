import {
  NotFoundError,
  RateLimitError,
  ServiceUnavailableError,
  isNormalisedRegNr,
  normaliseRegNr,
  formatRegNrForDisplay,
  isNonStandardPlate,
  type VehicleDataResult,
  type VehicleDetail,
  type VehicleLookupResponse,
  type VehicleLookupUnavailableReason,
} from 'shared';
import type { Env } from '../../config/env.js';
import { getOperationalSettings } from '../../config/settings.js';
import {
  createCircuitBreaker,
  type CircuitBreaker,
} from '../../integrations/vehicle-data/circuit-breaker.js';
import {
  createDailyCounter,
  type DailyCounter,
} from '../../integrations/vehicle-data/daily-counter.js';
import { createVehicleDataProvider } from '../../integrations/vehicle-data/index.js';
import type { VehicleDataProvider } from '../../integrations/vehicle-data/provider.js';
import { writeAuditLog } from '../../lib/audit.js';
import { toIsoDateTime, toIsoDateTimeOrNull } from '../../lib/dto-dates.js';
import { fieldError } from '../../lib/field-error.js';
import type { Database } from '../../lib/prisma.js';
import { getVehicleDetail } from '../vehicles/service.js';
import {
  applyVehicleDataResult,
  findVehicleForLookup,
  findVehicleForLookupById,
  insertVehicleDataSnapshot,
  vehicleDataResultFromCache,
  type VehicleForLookup,
} from './repository.js';

/**
 * Orchestrating a vehicle-data lookup (PROJECT_SPEC.md §6.1, §7.1; B10.2,
 * B10.3, B10.4).
 *
 * Every operational rule lives here, in the wrapper — never in a caller —
 * exactly as §7.1 asks: the cache is consulted first and unconditionally: a
 * fresh cache hit is served **before** the breaker or either daily ceiling is
 * even read, because a cached answer costs nothing to give (§6.1).
 *
 * The public lookup (`lookupVehicleDataPublic`) and the staff "hämta på nytt"
 * button (`refreshVehicleData`) share this cache/breaker/ceiling machinery but
 * disagree on purpose about what happens when a fresh call cannot be made:
 * the public hero **degrades honestly** and still answers with whatever it
 * has, because an anonymous visitor has no other way to ask again — the
 * public endpoint's response envelope exists exactly to carry that. The
 * staff button is a person explicitly asking for fresh data *right now*; if
 * that cannot happen, silently handing back the same stale row would read as
 * success, so it throws instead.
 */

/** §6.1, §7.1: a cached result is good for 30 days. */
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type VehicleDataRuntime = {
  readonly provider: VehicleDataProvider;
  readonly breaker: CircuitBreaker;
  readonly counter: DailyCounter;
};

/**
 * Builds the provider, the circuit breaker and the daily-ceiling counter
 * once, at app-build time — the same lifetime as `createBookingRequestLimiters`,
 * because the breaker and the counter are process-wide state shared by every
 * request, not something a handler recreates per call.
 */
export function createVehicleDataRuntime(env: Env): VehicleDataRuntime {
  return {
    provider: createVehicleDataProvider(env),
    // §7.1: five consecutive failures open it for ten minutes.
    breaker: createCircuitBreaker({
      failureThreshold: 5,
      openDurationMs: 10 * 60 * 1000,
    }),
    counter: createDailyCounter(),
  };
}

function isFresh(vehicle: VehicleForLookup, now: Date): boolean {
  return (
    vehicle.dataFetchedAt !== null &&
    now.getTime() - vehicle.dataFetchedAt.getTime() < CACHE_TTL_MS
  );
}

function assertUsableRegNr(input: string): string {
  const normalised = normaliseRegNr(input);
  if (!isNormalisedRegNr(normalised)) {
    throw fieldError(
      'registrationNumber',
      'Registreringsnumret kunde inte tolkas.',
    );
  }
  return normalised;
}

/**
 * The degraded answer for "we did not call the provider this time" — the
 * breaker is open, or the ceiling for this caller has been reached. Serves
 * whatever is cached, however stale, and only falls back to `UNAVAILABLE`
 * when there is nothing at all (§6.1).
 */
function degradedResponse(
  registrationNumber: string,
  existing: VehicleForLookup | null,
  reason: VehicleLookupUnavailableReason,
): VehicleLookupResponse {
  if (existing !== null && existing.dataFetchedAt !== null) {
    return {
      registrationNumber,
      data: vehicleDataResultFromCache(existing),
      source: 'CACHE',
      unavailableReason: null,
      fetchedAt: toIsoDateTime(existing.dataFetchedAt),
      suggestedServices: [],
    };
  }
  return {
    registrationNumber,
    data: null,
    source: 'UNAVAILABLE',
    unavailableReason: reason,
    fetchedAt: null,
    suggestedServices: [],
  };
}

/**
 * Finds-or-creates the ownerless `Vehicle` row a lookup result is cached
 * against, and writes the result onto it plus a `VehicleDataSnapshot`.
 *
 * A registration number is looked up before anyone knows whose car it is —
 * on the public start page, most often — and §4.2 is explicit that requiring
 * an owner would force fake customer records. `customerId` is left
 * untouched either way, including on a vehicle that already exists.
 *
 * `upsert`, not a plain `create` guarded by the caller's earlier read: two
 * public lookups for the same never-before-seen plate can race between that
 * read and this write, and a plain `create` would let the second one crash on
 * the unique index instead of quietly joining the first. `upsert` compiles to
 * one atomic `INSERT ... ON CONFLICT`, the same reasoning §6.2's exclusion
 * constraint and §4.4's sequence apply to their own check-then-act traps.
 */
async function persistLookupResult(
  db: Database,
  runtime: VehicleDataRuntime,
  registrationNumber: string,
  existing: VehicleForLookup | null,
  actorId: string | null,
  ipHash: string | null,
  fetchedAt: Date,
  data: VehicleDataResult,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const vehicleId =
      existing?.id ??
      (
        await tx.vehicle.upsert({
          where: { registrationNumber },
          create: {
            registrationNumber,
            registrationNumberDisplay:
              formatRegNrForDisplay(registrationNumber),
            isNonStandardPlate: isNonStandardPlate(registrationNumber),
            make: data.make,
            model: data.model,
          },
          // A concurrent winner already created the row; this call has
          // nothing to add beyond the `applyVehicleDataResult` write below.
          update: {},
          select: { id: true },
        })
      ).id;

    await applyVehicleDataResult(tx, vehicleId, data, fetchedAt);
    await insertVehicleDataSnapshot(tx, {
      vehicleId,
      providerName: runtime.provider.name,
      fetchedAt,
      data,
    });

    await writeAuditLog(tx, {
      userId: actorId,
      action: 'vehicle_data.fetched',
      entityType: 'Vehicle',
      entityId: vehicleId,
      after: { make: data.make, model: data.model, fetchedAt },
      ipHash,
    });
  });
}

export async function lookupVehicleDataPublic(
  db: Database,
  runtime: VehicleDataRuntime,
  registrationNumberInput: string,
  ipHash: string | null,
): Promise<VehicleLookupResponse> {
  const registrationNumber = assertUsableRegNr(registrationNumberInput);
  const now = new Date();

  const existing = await findVehicleForLookup(db, registrationNumber);
  if (existing !== null && isFresh(existing, now)) {
    return {
      registrationNumber,
      data: vehicleDataResultFromCache(existing),
      source: 'CACHE',
      unavailableReason: null,
      fetchedAt: toIsoDateTimeOrNull(existing.dataFetchedAt),
      suggestedServices: [],
    };
  }

  if (runtime.breaker.isOpen()) {
    return degradedResponse(
      registrationNumber,
      existing,
      'PROVIDER_UNAVAILABLE',
    );
  }

  const settings = await getOperationalSettings(db);
  if (
    !runtime.counter.consume('public', settings.vehicleLookupDailyLimitPublic)
  ) {
    return degradedResponse(
      registrationNumber,
      existing,
      'PUBLIC_LIMIT_REACHED',
    );
  }

  let result: VehicleDataResult | null;
  try {
    result = await runtime.provider.lookup(registrationNumber);
  } catch {
    runtime.breaker.recordFailure();
    return degradedResponse(
      registrationNumber,
      existing,
      'PROVIDER_UNAVAILABLE',
    );
  }
  runtime.breaker.recordSuccess();

  if (result === null) {
    // A confirmed "no such registration number" — the provider answered, it
    // just has nothing on this plate. Nothing to cache.
    return {
      registrationNumber,
      data: null,
      source: 'PROVIDER',
      unavailableReason: null,
      fetchedAt: toIsoDateTime(now),
      suggestedServices: [],
    };
  }

  await persistLookupResult(
    db,
    runtime,
    registrationNumber,
    existing,
    null,
    ipHash,
    now,
    result,
  );

  return {
    registrationNumber,
    data: result,
    source: 'PROVIDER',
    unavailableReason: null,
    fetchedAt: toIsoDateTime(now),
    suggestedServices: [],
  };
}

const VEHICLE_NOT_FOUND = 'Fordonet kunde inte hittas.';
const REFRESH_UNAVAILABLE =
  'Fordonsuppgifterna kunde inte hämtas just nu. Försök igen om en stund.';
const REFRESH_LIMIT_REACHED =
  'Dagens gräns för fordonsuppslag är nådd. Försök igen imorgon.';

/**
 * The staff "hämta på nytt" button (B10.2.3). Always attempts a fresh call —
 * never served from the freshness window, since the entire point of pressing
 * it is to get an answer newer than the one already on screen — and throws
 * rather than degrading when that is not possible, so the button never looks
 * like it worked when it did not.
 */
export async function refreshVehicleData(
  db: Database,
  runtime: VehicleDataRuntime,
  actorId: string,
  ipHash: string | null,
  vehicleId: string,
): Promise<VehicleDetail> {
  const existing = await findVehicleForLookupById(db, vehicleId);
  if (existing === null) {
    throw new NotFoundError(VEHICLE_NOT_FOUND);
  }

  if (runtime.breaker.isOpen()) {
    throw new ServiceUnavailableError(REFRESH_UNAVAILABLE);
  }

  const settings = await getOperationalSettings(db);
  if (
    !runtime.counter.consume('staff', settings.vehicleLookupDailyLimitStaff)
  ) {
    throw new RateLimitError(REFRESH_LIMIT_REACHED);
  }

  const now = new Date();
  let result: VehicleDataResult | null;
  try {
    result = await runtime.provider.lookup(existing.registrationNumber);
  } catch (error) {
    runtime.breaker.recordFailure();
    throw new ServiceUnavailableError(REFRESH_UNAVAILABLE, { cause: error });
  }
  runtime.breaker.recordSuccess();

  if (result === null) {
    // The provider answered but has nothing on this plate today. The
    // existing technical data is left alone — it is still the best
    // information the workshop has — but the timestamp moves forward so the
    // next press does not spend the ceiling again a moment later.
    await db.vehicle.update({
      where: { id: vehicleId },
      data: { dataFetchedAt: now },
    });
    return getVehicleDetail(db, vehicleId);
  }

  await persistLookupResult(
    db,
    runtime,
    existing.registrationNumber,
    existing,
    actorId,
    ipHash,
    now,
    result,
  );

  return getVehicleDetail(db, vehicleId);
}
