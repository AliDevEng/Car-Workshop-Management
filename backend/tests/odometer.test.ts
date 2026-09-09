import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  odometerReadingResponseSchema,
  paginatedResponseSchema,
  odometerReadingSchema,
  vehicleSchema,
  type OdometerReadingResponse,
} from 'shared';
import { createTestApp, type TestApp } from './helpers/app.js';
import { jsonBody } from './helpers/http.js';
import { loginAs, withAgent, type Agent } from './helpers/auth.js';

/**
 * B3.3 — odometer history (PROJECT_SPEC.md §3.5, §4.2).
 *
 * A reading below the vehicle's previous highest is accepted, with a warning
 * for a human to confirm — rejecting it would stop a mechanic recording what
 * the car actually shows.
 */

const readingListSchema = paginatedResponseSchema(odometerReadingSchema);

let plateCounter = 0;

async function seedVehicle(harness: TestApp, agent: Agent): Promise<string> {
  plateCounter += 1;
  const response = await withAgent(
    supertest(harness.app.server).post('/api/vehicles'),
    agent,
  )
    .send({
      registrationNumber: `ODO${String(plateCounter).padStart(3, '0')}`,
      make: 'Volvo',
      model: 'V60',
    })
    .expect(201);
  return vehicleSchema.parse(jsonBody(response)).id;
}

async function postReading(
  harness: TestApp,
  agent: Agent,
  vehicleId: string,
  body: Record<string, unknown>,
): Promise<OdometerReadingResponse> {
  const response = await withAgent(
    supertest(harness.app.server).post(
      `/api/vehicles/${vehicleId}/odometer-readings`,
    ),
    agent,
  )
    .send(body)
    .expect(201);
  return odometerReadingResponseSchema.parse(jsonBody(response));
}

describe('odometer readings', () => {
  let harness: TestApp;
  let agent: Agent;

  beforeAll(async () => {
    harness = await createTestApp();
    agent = await loginAs(harness, { role: 'MECHANIC' });
  });

  afterAll(async () => {
    await harness.close();
  });

  it('records a manual reading and updates the vehicle cache', async () => {
    const vehicleId = await seedVehicle(harness, agent);

    const result = await postReading(harness, agent, vehicleId, {
      km: 152_000,
    });
    expect(result.reading.km).toBe(152_000);
    expect(result.reading.source).toBe('MANUAL');
    expect(result.reading.userId).toBe(agent.userId);
    expect(result.warnings).toEqual([]);

    const vehicle = await harness.app.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { lastKnownOdometerKm: true },
    });
    expect(vehicle?.lastKnownOdometerKm).toBe(152_000);
  });

  it('warns when a reading is below the previous highest, but stores it', async () => {
    const vehicleId = await seedVehicle(harness, agent);

    await postReading(harness, agent, vehicleId, {
      km: 152_000,
      readAt: '2026-01-10T10:00:00.000Z',
    });
    const lower = await postReading(harness, agent, vehicleId, {
      km: 148_500,
      readAt: '2026-02-10T10:00:00.000Z',
    });

    expect(lower.reading.km).toBe(148_500);
    expect(lower.warnings).toHaveLength(1);
    expect(lower.warnings[0]).toContain('lägre');

    // The cache follows the newest reading by date, even though it is lower.
    const vehicle = await harness.app.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { lastKnownOdometerKm: true },
    });
    expect(vehicle?.lastKnownOdometerKm).toBe(148_500);
  });

  it('does not let an old correction overwrite the cache', async () => {
    const vehicleId = await seedVehicle(harness, agent);
    await postReading(harness, agent, vehicleId, {
      km: 160_000,
      readAt: '2026-03-01T10:00:00.000Z',
    });
    await postReading(harness, agent, vehicleId, {
      km: 120_000,
      readAt: '2024-01-01T10:00:00.000Z',
    });

    const vehicle = await harness.app.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { lastKnownOdometerKm: true },
    });
    expect(vehicle?.lastKnownOdometerKm).toBe(160_000);
  });

  it('lists a vehicle’s readings, newest entered first', async () => {
    const vehicleId = await seedVehicle(harness, agent);
    await postReading(harness, agent, vehicleId, { km: 10_000 });
    await postReading(harness, agent, vehicleId, { km: 20_000 });

    const response = await supertest(harness.app.server)
      .get(`/api/vehicles/${vehicleId}/odometer-readings`)
      .set('cookie', agent.cookies.join('; '))
      .expect(200);

    const page = readingListSchema.parse(jsonBody(response));
    expect(page.data.map((reading) => reading.km)).toEqual([20_000, 10_000]);
  });

  it('rejects an out-of-range reading', async () => {
    const vehicleId = await seedVehicle(harness, agent);
    await withAgent(
      supertest(harness.app.server).post(
        `/api/vehicles/${vehicleId}/odometer-readings`,
      ),
      agent,
    )
      .send({ km: 0 })
      .expect(400);
  });

  it('answers 404 for an unknown vehicle', async () => {
    await withAgent(
      supertest(harness.app.server).post(
        '/api/vehicles/01900000-0000-7000-8000-000000000000/odometer-readings',
      ),
      agent,
    )
      .send({ km: 1000 })
      .expect(404);

    await supertest(harness.app.server)
      .get(
        '/api/vehicles/01900000-0000-7000-8000-000000000000/odometer-readings',
      )
      .set('cookie', agent.cookies.join('; '))
      .expect(404);
  });
});
