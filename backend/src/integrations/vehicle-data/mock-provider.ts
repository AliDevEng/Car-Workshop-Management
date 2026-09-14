import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { vehicleDataResultSchema } from 'shared';
import type { VehicleDataProvider } from './provider.js';

/**
 * The fixture-driven provider (PROJECT_SPEC.md §7.1, B10.1.2).
 *
 * Used in every test and in local development, and it is the default
 * everywhere but production (B10.1.3) — the whole application can be built,
 * tested and demonstrated before a commercial contract exists, and CI never
 * spends money.
 *
 * A fixture's filename is the normalised registration number it answers for.
 * No file means a confirmed "no such registration number", which is a `null`
 * result rather than a thrown error — the provider genuinely answered, it
 * just answered "no". A fixture that fails `vehicleDataResultSchema` (see
 * `fixtures/BAD0001.json`) simulates a provider returning garbage: the
 * mapping step throws, and the caller treats that exactly like a transport
 * failure (B10.3.4) — a handled error, never a crash.
 */

function fixturePath(registrationNumber: string): string {
  return fileURLToPath(
    new URL(`./fixtures/${registrationNumber}.json`, import.meta.url),
  );
}

async function readFixture(path: string): Promise<unknown> {
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw) as unknown;
}

/**
 * Read structurally, matching `isPrismaKnownRequestError` — `node:fs`'s own
 * error type is not exported as a class to `instanceof` against, and the
 * shape is the contract.
 */
function isFileNotFoundError(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || !('code' in value)) {
    return false;
  }
  return value.code === 'ENOENT';
}

export function createMockVehicleDataProvider(): VehicleDataProvider {
  return {
    name: 'mock',

    async lookup(normalisedRegNr) {
      let raw: unknown;
      try {
        raw = await readFixture(fixturePath(normalisedRegNr));
      } catch (error) {
        if (isFileNotFoundError(error)) {
          return null;
        }
        throw error;
      }

      const parsed = vehicleDataResultSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(
          `Mock vehicle-data fixture for "${normalisedRegNr}" does not match VehicleDataResult: ${parsed.error.message}`,
        );
      }
      return parsed.data;
    },
  };
}
