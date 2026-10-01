import { describe, expect, it } from 'vitest';
import { normaliseRegNr, vehicleDataResultSchema } from 'shared';
import { loadDotEnv } from '../src/config/dotenv.js';
import { parseEnv } from '../src/config/env.js';
import { createVehicleDataProvider } from '../src/integrations/vehicle-data/index.js';

/**
 * B10.5.4 — the real provider, against the real API.
 *
 * **Deliberately not part of the normal suite, and never run in CI:** every
 * run is a billed call, and CI must never spend money (§7.1). It checks the
 * one thing no fixture can — that the provider's live response still maps to
 * `VehicleDataResult` — and is meant to be run by hand when a contract is
 * signed, when the provider announces an API change, and before a release.
 *
 * It reads the repository-root `.env`, so the provider and its key are the
 * ones the application itself would use:
 *
 *   RUN_VEHICLE_DATA_CONTRACT=1 VEHICLE_DATA_CONTRACT_PLATE=ABC123 \
 *     pnpm --filter backend exec vitest run tests/vehicle-data-provider.contract.test.ts
 *
 * `VEHICLE_DATA_CONTRACT_PLATE` must be a real registration number the
 * provider knows — the workshop's own car is the obvious choice. One run makes
 * exactly one call.
 */

const ENABLED = process.env['RUN_VEHICLE_DATA_CONTRACT'] === '1';
const PLATE = process.env['VEHICLE_DATA_CONTRACT_PLATE'] ?? '';

describe.skipIf(!ENABLED)('vehicle-data provider contract (B10.5.4)', () => {
  it('maps a live answer for a known plate to VehicleDataResult', async () => {
    loadDotEnv();
    const env = parseEnv(process.env);
    expect(
      env.VEHICLE_DATA_PROVIDER,
      'VEHICLE_DATA_PROVIDER is "mock": this test only means anything against the real provider',
    ).not.toBe('mock');

    const plate = normaliseRegNr(PLATE);
    expect(
      plate,
      'set VEHICLE_DATA_CONTRACT_PLATE to a real registration number',
    ).not.toBe('');

    const provider = createVehicleDataProvider(env);
    const result = await provider.lookup(plate);

    expect(result, `the provider has no vehicle for ${plate}`).not.toBeNull();
    // The provider already parses its own output; this repeats it against the
    // shared schema directly, so a failure names the field that drifted.
    const parsed = vehicleDataResultSchema.parse(result);
    expect(parsed.registrationNumber).toBe(plate);
    expect(parsed.make.length).toBeGreaterThan(0);
    expect(parsed.model.length).toBeGreaterThan(0);
  }, 30_000);
});
