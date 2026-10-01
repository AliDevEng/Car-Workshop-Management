import type { Env } from '../../config/env.js';
import { createMockVehicleDataProvider } from './mock-provider.js';
import type { VehicleDataProvider } from './provider.js';

export type { VehicleDataProvider } from './provider.js';

/**
 * Selects the active provider from `VEHICLE_DATA_PROVIDER` (PROJECT_SPEC.md
 * §7.1, B10.1.3). `mock` is the default everywhere but production.
 *
 * The real provider's transport is built (B10.5.1, `http-client.ts` and
 * `http-provider.ts`); its response mapping is not (B10.5.2), because that
 * needs the contracted provider's API documentation, which does not exist
 * yet. Wiring one in is `createHttpVehicleDataProvider` with that provider's
 * `buildRequest` and `mapResponse`, in a file of its own.
 *
 * Until then a non-`mock` value is refused here, loudly, rather than silently
 * falling back to the mock: §5.4's "the process refuses to start rather than
 * failing at 02:00" applies just as much to a provider that cannot map its
 * own answers as to a missing secret.
 */
export function createVehicleDataProvider(env: Env): VehicleDataProvider {
  if (env.VEHICLE_DATA_PROVIDER === 'mock') {
    return createMockVehicleDataProvider();
  }

  throw new Error(
    `VEHICLE_DATA_PROVIDER "${env.VEHICLE_DATA_PROVIDER}" has no response ` +
      'mapping yet — B10.5.2 needs the contracted API documentation. Set ' +
      'VEHICLE_DATA_PROVIDER=mock.',
  );
}
