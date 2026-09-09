import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  apiErrorSchema,
  customerDetailSchema,
  customerSchema,
  paginatedResponseSchema,
} from 'shared';
import { createTestApp, type TestApp } from './helpers/app.js';
import { jsonBody } from './helpers/http.js';
import { loginAs, withAgent, type Agent } from './helpers/auth.js';

/**
 * B3.1 — customer records (PROJECT_SPEC.md §4.2, §6.3, §8.2).
 *
 * `authenticated`, audited (personal data), never hard-deleted.
 */

const customerListSchema = paginatedResponseSchema(customerSchema);

const validCustomer = {
  type: 'PRIVATE',
  name: 'Cecilia Karlsson',
  phone: '070-123 45 67',
  email: 'cecilia@example.se',
} as const;

async function createCustomer(
  harness: TestApp,
  agent: Agent,
  body: Record<string, unknown> = validCustomer,
): Promise<{ id: string }> {
  const response = await withAgent(
    supertest(harness.app.server).post('/api/customers'),
    agent,
  )
    .send(body)
    .expect(201);
  return { id: customerSchema.parse(jsonBody(response)).id };
}

describe('customers', () => {
  let harness: TestApp;
  let agent: Agent;

  beforeAll(async () => {
    harness = await createTestApp();
    agent = await loginAs(harness, { role: 'MECHANIC' });
  });

  afterAll(async () => {
    await harness.close();
  });

  it('rejects an unauthenticated request', async () => {
    await supertest(harness.app.server).get('/api/customers').expect(401);
    await supertest(harness.app.server)
      .post('/api/customers')
      .send(validCustomer)
      .expect(403); // CSRF: no token on an anonymous client
  });

  it('creates a customer and derives the normalised phone', async () => {
    const response = await withAgent(
      supertest(harness.app.server).post('/api/customers'),
      agent,
    )
      .send(validCustomer)
      .expect(201);

    const created = customerSchema.parse(jsonBody(response));
    expect(created.phone).toBe('070-123 45 67');
    expect(created.phoneNormalised).toBe('+46701234567');
    expect(created.isActive).toBe(true);
    expect(created.anonymisedAt).toBeNull();
  });

  it('records the creation in the audit log (personal data, §4.2)', async () => {
    const { id } = await createCustomer(harness, agent, {
      ...validCustomer,
      name: 'Reviderad Kund',
    });

    const entry = await harness.app.prisma.auditLog.findFirst({
      where: { action: 'customer.created', entityId: id },
    });
    expect(entry?.entityType).toBe('Customer');
    expect(entry?.afterJson).toMatchObject({ name: 'Reviderad Kund' });
  });

  it('rejects a customer with no phone', async () => {
    await withAgent(
      supertest(harness.app.server).post('/api/customers'),
      agent,
    )
      .send({ type: 'PRIVATE', name: 'Ingen Telefon' })
      .expect(400);
  });

  it('returns a customer with its vehicles', async () => {
    const { id } = await createCustomer(harness, agent, {
      ...validCustomer,
      name: 'Med Fordon',
    });

    await withAgent(
      supertest(harness.app.server).post('/api/vehicles'),
      agent,
    )
      .send({ registrationNumber: 'kfd 12x', customerId: id, make: 'Saab', model: '9-3' })
      .expect(201);

    const response = await supertest(harness.app.server)
      .get(`/api/customers/${id}`)
      .set('cookie', agent.cookies.join('; '))
      .expect(200);

    const detail = customerDetailSchema.parse(jsonBody(response));
    expect(detail.vehicles).toHaveLength(1);
    expect(detail.vehicles[0]?.registrationNumber).toBe('KFD12X');
  });

  it('answers 404 for a customer that does not exist', async () => {
    const response = await supertest(harness.app.server)
      .get('/api/customers/01900000-0000-7000-8000-000000000000')
      .set('cookie', agent.cookies.join('; '))
      .expect(404);
    expect(apiErrorSchema.parse(jsonBody(response)).error.code).toBe(
      'NOT_FOUND',
    );
  });

  it('updates a customer and re-derives the phone', async () => {
    const { id } = await createCustomer(harness, agent, {
      ...validCustomer,
      name: 'Före Ändring',
    });

    const response = await withAgent(
      supertest(harness.app.server).patch(`/api/customers/${id}`),
      agent,
    )
      .send({ name: 'Efter Ändring', phone: '08-99 88 77' })
      .expect(200);

    const updated = customerSchema.parse(jsonBody(response));
    expect(updated.name).toBe('Efter Ändring');
    expect(updated.phoneNormalised).toBe('+468998877');
  });

  it('deactivates and reactivates rather than deleting', async () => {
    const { id } = await createCustomer(harness, agent, {
      ...validCustomer,
      name: 'Vilande Kund',
    });

    const deactivated = await withAgent(
      supertest(harness.app.server).post(`/api/customers/${id}/deactivate`),
      agent,
    ).expect(200);
    expect(customerSchema.parse(jsonBody(deactivated)).isActive).toBe(false);

    // The row survives.
    expect(
      await harness.app.prisma.customer.findUnique({ where: { id } }),
    ).not.toBeNull();

    // Idempotent.
    await withAgent(
      supertest(harness.app.server).post(`/api/customers/${id}/deactivate`),
      agent,
    ).expect(200);

    const reactivated = await withAgent(
      supertest(harness.app.server).post(`/api/customers/${id}/reactivate`),
      agent,
    ).expect(200);
    expect(customerSchema.parse(jsonBody(reactivated)).isActive).toBe(true);
  });

  it('has no hard-delete route', async () => {
    const { id } = await createCustomer(harness, agent, {
      ...validCustomer,
      name: 'Odödlig',
    });
    await withAgent(
      supertest(harness.app.server).delete(`/api/customers/${id}`),
      agent,
    ).expect(404);
  });
});

describe('customer search (§8.2, B3.1.2)', () => {
  let harness: TestApp;
  let agent: Agent;

  beforeAll(async () => {
    harness = await createTestApp();
    agent = await loginAs(harness);
    await createCustomer(harness, agent, {
      type: 'PRIVATE',
      name: 'Gunilla Sjöberg',
      phone: '070-123 45 67',
      email: 'gunilla@example.se',
    });
    await createCustomer(harness, agent, {
      type: 'COMPANY',
      name: 'Sjöberg Åkeri AB',
      phone: '021-45 67 89',
      orgNumber: '556000-1234',
    });
  });

  afterAll(async () => {
    await harness.close();
  });

  async function list(query: string): Promise<string[]> {
    const response = await supertest(harness.app.server)
      .get(`/api/customers?q=${encodeURIComponent(query)}`)
      .set('cookie', agent.cookies.join('; '))
      .expect(200);
    return customerListSchema
      .parse(jsonBody(response))
      .data.map((customer) => customer.name);
  }

  it('matches on name', async () => {
    expect(await list('sjöberg')).toEqual(
      expect.arrayContaining(['Gunilla Sjöberg', 'Sjöberg Åkeri AB']),
    );
  });

  it('matches the phone as the customer recites it', async () => {
    expect(await list('070-123')).toContain('Gunilla Sjöberg');
  });

  it('matches the phone typed in a different shape than stored', async () => {
    // Stored entered form is `070-123 45 67`; the query normalises to E.164
    // and hits `phoneNormalised` even though the digits were grouped otherwise.
    expect(await list('+46 70 123 45 67')).toContain('Gunilla Sjöberg');
  });

  it('matches on email', async () => {
    expect(await list('gunilla@')).toEqual(['Gunilla Sjöberg']);
  });
});
