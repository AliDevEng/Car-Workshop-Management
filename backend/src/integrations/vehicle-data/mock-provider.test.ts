import { describe, expect, it } from 'vitest';
import { createMockVehicleDataProvider } from './mock-provider.js';

describe('createMockVehicleDataProvider (§7.1, B10.1.2)', () => {
  it('returns the mapped result for a known plate', async () => {
    const provider = createMockVehicleDataProvider();
    const result = await provider.lookup('ABC12D');

    expect(result).not.toBeNull();
    expect(result?.make).toBe('Volvo');
    expect(result?.registrationNumber).toBe('ABC12D');
  });

  it('returns null for an unknown registration number, not an error', async () => {
    const provider = createMockVehicleDataProvider();
    const result = await provider.lookup('ZZZ999');

    expect(result).toBeNull();
  });

  it('throws on a fixture that does not match VehicleDataResult', async () => {
    const provider = createMockVehicleDataProvider();

    await expect(provider.lookup('BAD0001')).rejects.toThrow();
  });

  it('rethrows a read failure that is not a missing file', async () => {
    // Invalid JSON has no `.code` at all, unlike a missing-file error — the
    // provider must not mistake "the fixture is broken" for "there is no
    // such registration number".
    const provider = createMockVehicleDataProvider();

    await expect(provider.lookup('BROKENJSON')).rejects.toThrow();
  });
});
