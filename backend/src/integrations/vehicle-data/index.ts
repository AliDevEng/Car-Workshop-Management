import type { Env } from '../../config/env.js';
import { createMockVehicleDataProvider } from './mock-provider.js';
import type { VehicleDataProvider } from './provider.js';

export type { VehicleDataProvider } from './provider.js';

/**
 * Selects the active provider from `VEHICLE_DATA_PROVIDER` (PROJECT_SPEC.md
 * §7.1, B10.1.3). `mock` is the default everywhere but production, and stays
 * the only implementation until B10.5 builds the real HTTP client in Phase 6.
 *
 * A non-`mock` value is refused here, loudly, rather than silently falling
 * back to the mock: §5.4's "the process refuses to start rather than failing
 * at 02:00" applies just as much to a provider that does not exist yet as to
 * a missing secret.
 */
export function createVehicleDataProvider(env: Env): VehicleDataProvider {
  if (env.VEHICLE_DATA_PROVIDER === 'mock') {
    return createMockVehicleDataProvider();
  }

  throw new Error(
    `VEHICLE_DATA_PROVIDER "${env.VEHICLE_DATA_PROVIDER}" has no implementation yet — ` +
      'the real provider is B10.5, which has not been built (Phase 6). Set ' +
      'VEHICLE_DATA_PROVIDER=mock.',
  );
}
