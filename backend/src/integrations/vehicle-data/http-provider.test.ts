import { describe, expect, it } from 'vitest';
import { vehicleDataResultSchema, type VehicleDataResult } from 'shared';
import type { HttpJsonClient, HttpJsonRequest } from './http-client.js';
import { VehicleDataHttpError } from './http-client.js';
import { createHttpVehicleDataProvider } from './http-provider.js';

/**
 * B10.5 — the provider-independent half of a real HTTP provider: what a
 * status means, and what may leave the mapper.
 *
 * The transport is stubbed here on purpose; `http-client.test.ts` drives the
 * real one against a real socket. This file is about interpretation.
 */

const API_KEY = 'sk-live-0123456789abcdef';

const VOLVO: VehicleDataResult = {
  registrationNumber: 'ABC12D',
  make: 'Volvo',
  model: 'V70',
  variant: null,
  modelYear: 2012,
  vin: null,
  engineCode: null,
  fuelType: 'Diesel',
  firstRegistrationDate: '2012-03-01',
  lastInspectionDate: '2026-03-01',
  nextInspectionDueDate: '2027-03-31',
};

function stubClient(status: number, body: unknown) {
  const requests: HttpJsonRequest[] = [];
  const client: HttpJsonClient = {
    getJson: (request) => {
      requests.push(request);
      return Promise.resolve({ status, body });
    },
  };
  return { client, requests };
}

function provider(
  client: HttpJsonClient,
  mapResponse = (body: unknown) => vehicleDataResultSchema.parse(body),
) {
  return createHttpVehicleDataProvider({
    name: 'test-provider',
    client,
    buildRequest: (regNr) => ({
      url: `https://provider.invalid/vehicles/${encodeURIComponent(regNr)}`,
      headers: { 'x-api-key': API_KEY },
    }),
    mapResponse,
  });
}

describe('createHttpVehicleDataProvider (B10.5)', () => {
  it('maps a 200 to the shared result', async () => {
    const { client, requests } = stubClient(200, VOLVO);

    await expect(provider(client).lookup('ABC12D')).resolves.toEqual(VOLVO);
    expect(requests).toEqual([
      {
        url: 'https://provider.invalid/vehicles/ABC12D',
        headers: { 'x-api-key': API_KEY },
      },
    ]);
  });

  it('reads a 404 as a confirmed "no such registration number", not a failure', async () => {
    const { client } = stubClient(404, { error: 'not found' });

    await expect(provider(client).lookup('ABC12D')).resolves.toBeNull();
  });

  it.each([400, 401, 403, 429])(
    'treats a %i as a failure the breaker counts',
    async (status) => {
      const { client } = stubClient(status, null);

      await expect(provider(client).lookup('ABC12D')).rejects.toBeInstanceOf(
        VehicleDataHttpError,
      );
    },
  );

  it('rejects, rather than crashes, when the mapper does not recognise the body', async () => {
    const { client } = stubClient(200, { unexpected: true });

    await expect(provider(client).lookup('ABC12D')).rejects.toThrow();
  });

  it('strips any field the shared contract does not declare — owner data cannot leak (B10.4.2)', async () => {
    const { client } = stubClient(200, null);
    // A careless mapper that spreads the provider's payload into the result.
    const leaky = () => ({
      ...VOLVO,
      ownerName: 'Anna Andersson',
      ownerAddress: 'Storgatan 1',
      apiKey: API_KEY,
    });

    const result = await provider(client, leaky).lookup('ABC12D');

    expect(result).toEqual(VOLVO);
    expect(JSON.stringify(result)).not.toContain('Anna');
    expect(JSON.stringify(result)).not.toContain(API_KEY);
  });

  it('refuses an answer about a different registration number', async () => {
    const { client } = stubClient(200, {
      ...VOLVO,
      registrationNumber: 'ABC12E',
    });

    await expect(provider(client).lookup('ABC12D')).rejects.toThrow(
      /different registration number/,
    );
  });

  it('propagates a transport failure unchanged', async () => {
    const failure = new VehicleDataHttpError(
      'Vehicle-data request timed out',
      null,
    );
    const client: HttpJsonClient = { getJson: () => Promise.reject(failure) };

    await expect(provider(client).lookup('ABC12D')).rejects.toBe(failure);
  });
});
