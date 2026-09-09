import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  customerDetailSchema,
  customerSchema,
  odometerReadingResponseSchema,
  paginatedResponseSchema,
  odometerReadingSchema,
  vehicleDetailSchema,
  vehicleSchema,
} from 'shared';
import { createTestApp, type TestApp } from './helpers/app.js';
import { jsonBody } from './helpers/http.js';
import { loginAs, withAgent, type Agent } from './helpers/auth.js';

/**
 * B3.6 — the core-register journey (PROJECT_SPEC.md §6.3).
 *
 * Create an ownerless vehicle, attach it to a customer, record readings,
 * reassign the owner — and lose neither the vehicle nor its odometer history
 * at any step, because history hangs off the vehicle, not the customer.
 */

const readingListSchema = paginatedResponseSchema(odometerReadingSchema);

describe('customer and vehicle journey', () => {
  let harness: TestApp;
  let agent: Agent;

  beforeAll(async () => {
    harness = await createTestApp();
    agent = await loginAs(harness, { role: 'MECHANIC' });
  });

  afterAll(async () => {
    await harness.close();
  });

  it('runs end to end without losing vehicle or odometer history', async () => {
    // 1. A plate is looked up before anyone knows whose car it is.
    const created = vehicleSchema.parse(
      jsonBody(
        await withAgent(
          supertest(harness.app.server).post('/api/vehicles'),
          agent,
        )
          .send({ registrationNumber: 'jrn 45 c', make: 'Volvo', model: 'V90' })
          .expect(201),
      ),
    );
    expect(created.customerId).toBeNull();
    const vehicleId = created.id;

    // 2. Two odometer readings while the car has no owner.
    for (const km of [180_000, 184_500]) {
      odometerReadingResponseSchema.parse(
        jsonBody(
          await withAgent(
            supertest(harness.app.server).post(
              `/api/vehicles/${vehicleId}/odometer-readings`,
            ),
            agent,
          )
            .send({ km })
            .expect(201),
        ),
      );
    }

    // 3. A customer is created and the car attached to them.
    const first = customerSchema.parse(
      jsonBody(
        await withAgent(
          supertest(harness.app.server).post('/api/customers'),
          agent,
        )
          .send({ type: 'PRIVATE', name: 'Johanna Ek', phone: '070-45 45 45' })
          .expect(201),
      ),
    );

    await withAgent(
      supertest(harness.app.server).patch(`/api/vehicles/${vehicleId}`),
      agent,
    )
      .send({ customerId: first.id })
      .expect(200);

    // The customer page shows the car.
    const firstDetail = customerDetailSchema.parse(
      jsonBody(
        await supertest(harness.app.server)
          .get(`/api/customers/${first.id}`)
          .set('cookie', agent.cookies.join('; '))
          .expect(200),
      ),
    );
    expect(firstDetail.vehicles.map((vehicle) => vehicle.id)).toEqual([
      vehicleId,
    ]);

    // 4. The car changes hands. History must not move with the owner.
    const second = customerSchema.parse(
      jsonBody(
        await withAgent(
          supertest(harness.app.server).post('/api/customers'),
          agent,
        )
          .send({ type: 'PRIVATE', name: 'Karl Nyström', phone: '073-10 10 10' })
          .expect(201),
      ),
    );

    await withAgent(
      supertest(harness.app.server).patch(`/api/vehicles/${vehicleId}`),
      agent,
    )
      .send({ customerId: second.id })
      .expect(200);

    // Old owner: no cars. New owner: the car.
    const firstAfter = customerDetailSchema.parse(
      jsonBody(
        await supertest(harness.app.server)
          .get(`/api/customers/${first.id}`)
          .set('cookie', agent.cookies.join('; '))
          .expect(200),
      ),
    );
    expect(firstAfter.vehicles).toEqual([]);

    const vehicleDetail = vehicleDetailSchema.parse(
      jsonBody(
        await supertest(harness.app.server)
          .get(`/api/vehicles/${vehicleId}`)
          .set('cookie', agent.cookies.join('; '))
          .expect(200),
      ),
    );
    expect(vehicleDetail.customer?.id).toBe(second.id);

    // 5. The odometer history is intact through both reassignments.
    const readings = readingListSchema.parse(
      jsonBody(
        await supertest(harness.app.server)
          .get(`/api/vehicles/${vehicleId}/odometer-readings`)
          .set('cookie', agent.cookies.join('; '))
          .expect(200),
      ),
    );
    expect(
      readings.data.map((reading) => reading.km).sort((a, b) => a - b),
    ).toEqual([180_000, 184_500]);
    expect(vehicleDetail.lastKnownOdometerKm).toBe(184_500);
  });
});
