import type { VehicleDataResult } from 'shared';

/**
 * The vehicle-data provider boundary (PROJECT_SPEC.md §7.1, B10.1.1).
 *
 * Two implementations exist behind this interface: `createMockVehicleDataProvider`
 * (fixture-driven, used in every test and in local development) and, from
 * B10.5, a real HTTP client. Which one is active is one env var
 * (`VEHICLE_DATA_PROVIDER`) — nothing outside `integrations/vehicle-data/`
 * knows or cares which.
 *
 * A provider maps its own response shape to `VehicleDataResult` **inside its
 * own implementation**. No provider's field names appear anywhere else, which
 * is what lets one be swapped for another without touching a caller.
 */
export type VehicleDataProvider = {
  readonly name: string;
  /**
   * Resolves to the mapped result, `null` for a confirmed "no such
   * registration number", or rejects for anything that stopped the provider
   * from answering at all — a timeout, a non-2xx response, a payload that
   * fails to map. The caller (`modules/vehicle-data/service.ts`) treats every
   * rejection identically: it counts against the circuit breaker and
   * degrades to cache, never a crash (B10.3.4).
   */
  readonly lookup: (
    normalisedRegNr: string,
  ) => Promise<VehicleDataResult | null>;
};
