import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../config/env.js';
import { createVehicleDataProvider } from './index.js';

function testEnv(overrides: Record<string, string> = {}) {
  return parseEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/unused',
    SESSION_COOKIE_SECRET: 'a'.repeat(64),
    IP_HASH_SALT: 's'.repeat(32),
    FORM_TOKEN_SECRET: 'f'.repeat(32),
    PUBLIC_BASE_URL: 'http://localhost:3000',
    ...overrides,
  });
}

describe('createVehicleDataProvider (§7.1, B10.1.3)', () => {
  it('returns the mock provider by default', () => {
    const provider = createVehicleDataProvider(testEnv());
    expect(provider.name).toBe('mock');
  });

  it('refuses to start for a provider that has not been built yet', () => {
    const env = testEnv({
      VEHICLE_DATA_PROVIDER: 'biluppgifter',
      VEHICLE_DATA_API_KEY: 'test-key',
    });
    expect(() => createVehicleDataProvider(env)).toThrow(/B10.5/);
  });
});
