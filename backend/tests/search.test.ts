import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  SEARCH_RESULTS_PER_CATEGORY,
  customerSchema,
  searchResponseSchema,
  type SearchResult,
} from 'shared';
import { createTestApp, type TestApp } from './helpers/app.js';
import { jsonBody } from './helpers/http.js';
import { loginAs, withAgent, type Agent } from './helpers/auth.js';

/**
 * B3.4 — the one search box in the top bar (PROJECT_SPEC.md §6.3).
 *
 * Customers and vehicles now; articles join in B4.6. Each category is capped
 * so one crowded kind cannot fill the list.
 */

async function createCustomer(
  harness: TestApp,
  agent: Agent,
  body: Record<string, unknown>,
): Promise<string> {
  const response = await withAgent(
    supertest(harness.app.server).post('/api/customers'),
    agent,
  )
    .send(body)
    .expect(201);
  return customerSchema.parse(jsonBody(response)).id;
}

async function createVehicle(
  harness: TestApp,
  agent: Agent,
  body: Record<string, unknown>,
): Promise<void> {
  await withAgent(supertest(harness.app.server).post('/api/vehicles'), agent)
    .send(body)
    .expect(201);
}

describe('global search', () => {
  let harness: TestApp;
  let agent: Agent;

  beforeAll(async () => {
    harness = await createTestApp();
    agent = await loginAs(harness);

    const owner = await createCustomer(harness, agent, {
      type: 'PRIVATE',
      name: 'Bengt Bäckström',
      phone: '070-555 12 34',
    });
    await createVehicle(harness, agent, {
      registrationNumber: 'BEN12T',
      customerId: owner,
      make: 'Volvo',
      model: 'XC60',
    });
    await createVehicle(harness, agent, {
      registrationNumber: 'ORP999',
      make: 'Volvo',
      model: 'XC90',
    });
  });

  afterAll(async () => {
    await harness.close();
  });

  async function search(query: string): Promise<SearchResult[]> {
    const response = await supertest(harness.app.server)
      .get(`/api/search?q=${encodeURIComponent(query)}`)
      .set('cookie', agent.cookies.join('; '))
      .expect(200);
    return searchResponseSchema.parse(jsonBody(response)).results;
  }

  it('rejects an unauthenticated caller', async () => {
    await supertest(harness.app.server).get('/api/search?q=volvo').expect(401);
  });

  it('finds a customer by name', async () => {
    const results = await search('bäckström');
    expect(
      results.some(
        (hit) => hit.type === 'CUSTOMER' && hit.name === 'Bengt Bäckström',
      ),
    ).toBe(true);
  });

  it('finds a vehicle by registration number, however spelled', async () => {
    const results = await search('ben 12 t');
    const vehicle = results.find((hit) => hit.type === 'VEHICLE');
    expect(vehicle?.type).toBe('VEHICLE');
    if (vehicle?.type === 'VEHICLE') {
      expect(vehicle.registrationNumber).toBe('BEN12T');
      expect(vehicle.customerName).toBe('Bengt Bäckström');
    }
  });

  it('reports a vehicle with no owner as customerName null', async () => {
    const results = await search('ORP999');
    const vehicle = results.find((hit) => hit.type === 'VEHICLE');
    expect(vehicle?.type === 'VEHICLE' && vehicle.customerName).toBeNull();
  });

  it('caps each category', async () => {
    for (let i = 0; i < SEARCH_RESULTS_PER_CATEGORY + 5; i += 1) {
      await createCustomer(harness, agent, {
        type: 'PRIVATE',
        name: `Sökbar Person ${String(i)}`,
        phone: '070-000 00 00',
      });
    }
    const results = await search('Sökbar Person');
    expect(
      results.filter((hit) => hit.type === 'CUSTOMER'),
    ).toHaveLength(SEARCH_RESULTS_PER_CATEGORY);
  });

  it('returns nothing for a query that is only wildcards', async () => {
    expect(await search('%%%')).toEqual([]);
  });
});
