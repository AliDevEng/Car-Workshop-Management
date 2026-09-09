import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  apiErrorSchema,
  customerSchema,
  paginatedResponseSchema,
  vehicleDetailSchema,
  vehicleSchema,
  type Vehicle,
} from 'shared';
import { createTestApp, type TestApp } from './helpers/app.js';
import { jsonBody } from './helpers/http.js';
import { loginAs, withAgent, type Agent } from './helpers/auth.js';

/**
 * B3.2 — vehicle records (PROJECT_SPEC.md §4.2, §6.3).
 *
 * The registration number is normalised for storage on the server; the client
 * sends it as typed. `customerId` is optional, because a plate is looked up
 * before anyone knows whose car it is.
 */

const vehicleListSchema = paginatedResponseSchema(vehicleSchema);

async function createCustomer(
  harness: TestApp,
  agent: Agent,
  name = 'Fordonsägare',
): Promise<string> {
  const response = await withAgent(
    supertest(harness.app.server).post('/api/customers'),
    agent,
  )
    .send({ type: 'PRIVATE', name, phone: '070-000 00 00' })
    .expect(201);
  return customerSchema.parse(jsonBody(response)).id;
}

async function createVehicle(
  harness: TestApp,
  agent: Agent,
  body: Record<string, unknown>,
): Promise<Vehicle> {
  const response = await withAgent(
    supertest(harness.app.server).post('/api/vehicles'),
    agent,
  )
    .send(body)
    .expect(201);
  return vehicleSchema.parse(jsonBody(response));
}

describe('vehicles', () => {
  let harness: TestApp;
  let agent: Agent;

  beforeAll(async () => {
    harness = await createTestApp();
    agent = await loginAs(harness, { role: 'MECHANIC' });
  });

  afterAll(async () => {
    await harness.close();
  });

  it('creates an ownerless vehicle, normalising the plate', async () => {
    const vehicle = await createVehicle(harness, agent, {
      registrationNumber: ' abc 12a ',
      make: 'Volvo',
      model: 'V70',
    });

    expect(vehicle.registrationNumber).toBe('ABC12A');
    expect(vehicle.registrationNumberDisplay).toBe('ABC 12A');
    expect(vehicle.isNonStandardPlate).toBe(false);
    expect(vehicle.customerId).toBeNull();
  });

  it('round-trips the optional dates as YYYY-MM-DD', async () => {
    const vehicle = await createVehicle(harness, agent, {
      registrationNumber: 'DAT111',
      make: 'Volvo',
      model: 'V90',
      modelYear: 2018,
      vin: 'YV1AAAAA1A1234567',
      firstRegistrationDate: '2018-04-11',
      lastInspectionDate: '2025-03-02',
      nextInspectionDueDate: '2026-03-31',
    });

    expect(vehicle.firstRegistrationDate).toBe('2018-04-11');
    expect(vehicle.lastInspectionDate).toBe('2025-03-02');
    expect(vehicle.nextInspectionDueDate).toBe('2026-03-31');
    expect(vehicle.modelYear).toBe(2018);
  });

  it('accepts a personalised plate and flags it', async () => {
    const vehicle = await createVehicle(harness, agent, {
      registrationNumber: 'MINBIL',
      make: 'BMW',
      model: '320d',
    });
    expect(vehicle.registrationNumber).toBe('MINBIL');
    expect(vehicle.isNonStandardPlate).toBe(true);
  });

  it('rejects a plate that cannot be a plate at all', async () => {
    await withAgent(
      supertest(harness.app.server).post('/api/vehicles'),
      agent,
    )
      .send({ registrationNumber: '- -', make: 'X', model: 'Y' })
      .expect(400);
  });

  it('rejects a duplicate registration number as 409', async () => {
    await createVehicle(harness, agent, {
      registrationNumber: 'DUP111',
      make: 'Ford',
      model: 'Focus',
    });
    const response = await withAgent(
      supertest(harness.app.server).post('/api/vehicles'),
      agent,
    )
      .send({ registrationNumber: 'dup 111', make: 'Ford', model: 'Focus' })
      .expect(409);
    expect(apiErrorSchema.parse(jsonBody(response)).error.code).toBe(
      'CONFLICT',
    );
  });

  it('rejects a customerId that does not exist', async () => {
    await withAgent(
      supertest(harness.app.server).post('/api/vehicles'),
      agent,
    )
      .send({
        registrationNumber: 'NOO111',
        customerId: '01900000-0000-7000-8000-000000000000',
        make: 'Kia',
        model: 'Ceed',
      })
      .expect(400);
  });

  it('looks a vehicle up by registration number, any spelling', async () => {
    await createVehicle(harness, agent, {
      registrationNumber: 'LOO88K',
      make: 'Audi',
      model: 'A4',
    });

    const response = await supertest(harness.app.server)
      .get('/api/vehicles/by-regnr/loo-88k')
      .set('cookie', agent.cookies.join('; '))
      .expect(200);
    expect(vehicleDetailSchema.parse(jsonBody(response)).make).toBe('Audi');

    await supertest(harness.app.server)
      .get('/api/vehicles/by-regnr/zzz99z')
      .set('cookie', agent.cookies.join('; '))
      .expect(404);
  });

  it('reassigns the owner without touching the vehicle', async () => {
    const first = await createCustomer(harness, agent, 'Första Ägaren');
    const second = await createCustomer(harness, agent, 'Andra Ägaren');
    const vehicle = await createVehicle(harness, agent, {
      registrationNumber: 'OWN111',
      customerId: first,
      make: 'Skoda',
      model: 'Octavia',
    });

    const reassigned = await withAgent(
      supertest(harness.app.server).patch(`/api/vehicles/${vehicle.id}`),
      agent,
    )
      .send({ customerId: second })
      .expect(200);
    expect(vehicleSchema.parse(jsonBody(reassigned)).customerId).toBe(second);

    const detached = await withAgent(
      supertest(harness.app.server).patch(`/api/vehicles/${vehicle.id}`),
      agent,
    )
      .send({ customerId: null })
      .expect(200);
    expect(vehicleSchema.parse(jsonBody(detached)).customerId).toBeNull();
  });

  it('filters the list by customer', async () => {
    const owner = await createCustomer(harness, agent, 'Listägare');
    await createVehicle(harness, agent, {
      registrationNumber: 'FIL111',
      customerId: owner,
      make: 'Nissan',
      model: 'Micra',
    });

    const response = await supertest(harness.app.server)
      .get(`/api/vehicles?customerId=${owner}`)
      .set('cookie', agent.cookies.join('; '))
      .expect(200);
    const page = vehicleListSchema.parse(jsonBody(response));
    expect(page.data).toHaveLength(1);
    expect(page.data[0]?.registrationNumber).toBe('FIL111');
  });

  it('records vehicle mutations in the audit log', async () => {
    const vehicle = await createVehicle(harness, agent, {
      registrationNumber: 'AUD111',
      make: 'Peugeot',
      model: '208',
    });
    const entry = await harness.app.prisma.auditLog.findFirst({
      where: { action: 'vehicle.created', entityId: vehicle.id },
    });
    expect(entry?.entityType).toBe('Vehicle');
  });

  it('answers 404 for an unknown vehicle', async () => {
    await supertest(harness.app.server)
      .get('/api/vehicles/01900000-0000-7000-8000-000000000000')
      .set('cookie', agent.cookies.join('; '))
      .expect(404);
  });
});
