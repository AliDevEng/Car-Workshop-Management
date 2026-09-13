import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  serviceRecommendationListResponseSchema,
  serviceRecommendationResponseSchema,
  serviceRuleResponseSchema,
} from 'shared';
import { createTestApp, type TestApp } from './helpers/app.js';
import { loginAs, type Agent } from './helpers/auth.js';
import { jsonBody } from './helpers/http.js';
import {
  completeWorkOrder,
  get,
  patch,
  post,
  seedSubject,
} from './helpers/work-orders.js';

/**
 * Service recommendations end to end (B9.4–B9.6).
 *
 * The matching and due-date arithmetic have their own exhaustive, 100%
 * branch-covered suite in `shared/tests/service-rules.test.ts`. What this
 * file exercises is everything that only exists once there is a database: the
 * odometer and work-order-completion recompute triggers (B9.6.1), that a
 * human decision survives a recompute untouched (B9.6.4), that advice which no
 * longer holds is removed (B9.4.3), and the accept/dismiss and authorisation
 * surface (B9.5).
 */

let harness: TestApp;
let admin: Agent;

beforeAll(async () => {
  harness = await createTestApp();
  admin = await loginAs(harness, { role: 'ADMIN' });
}, 180_000);

afterAll(async () => {
  await harness.close();
});

/**
 * A vehicle registered long enough ago that every baseline is "no history
 * yet", carrying a **make unique to this call**. Rules match by vehicle
 * attributes, not by id — reusing a fixed make/model across test cases would
 * let one test's rule silently pick up another test's vehicle (and vice
 * versa) through nothing but both naming "Volvo V70", with no cleanup between
 * tests to stop it. A fresh make per seeded vehicle makes every test's rules
 * match only its own vehicle, by construction.
 */
async function seedVehicle(): Promise<{ vehicleId: string; make: string }> {
  const subject = await seedSubject(harness);
  const make = `Volvo-${crypto.randomUUID().slice(0, 8)}`;
  await harness.app.prisma.vehicle.update({
    where: { id: subject.vehicleId },
    data: {
      make,
      firstRegistrationDate: new Date('2015-01-01T00:00:00.000Z'),
    },
  });
  return { vehicleId: subject.vehicleId, make };
}

async function createRule(
  make: string,
  overrides: Record<string, unknown> = {},
) {
  const response = await post(harness, admin, '/api/service-rules', {
    make,
    model: 'V70',
    serviceType: 'SERVICE_A',
    intervalKm: 1_000,
    sourceNote: 'Volvo servicehäfte 2019',
    ...overrides,
  }).expect(201);
  return serviceRuleResponseSchema.parse(jsonBody(response)).rule;
}

async function recordOdometer(vehicleId: string, km: number): Promise<void> {
  await post(harness, admin, `/api/vehicles/${vehicleId}/odometer-readings`, {
    km,
  }).expect(201);
}

async function vehicleRecommendations(vehicleId: string) {
  const response = await get(
    harness,
    admin,
    `/api/vehicles/${vehicleId}/service-recommendations`,
  ).expect(200);
  return serviceRecommendationListResponseSchema.parse(jsonBody(response)).data;
}

describe('B9.6.1 — recomputing on an odometer update', () => {
  it('produces a recommendation once the vehicle enters the due window', async () => {
    const { vehicleId, make } = await seedVehicle();
    await createRule(make, { serviceType: 'SERVICE_A', intervalKm: 1_000 });

    // Baseline is 0 km (no service history, first registration only); due at
    // 1 000 km. 900 km leaves 100 remaining, inside the 1 500 km DUE_SOON
    // window.
    await recordOdometer(vehicleId, 900);

    const recommendations = await vehicleRecommendations(vehicleId);
    const serviceA = recommendations.find((r) => r.serviceType === 'SERVICE_A');

    expect(serviceA).toBeDefined();
    expect(serviceA?.dueKm).toBe(1_000);
    expect(serviceA?.severity).toBe('DUE_SOON');
    expect(serviceA?.status).toBe('SUGGESTED');
    expect(serviceA?.sourceNote).toBe('Volvo servicehäfte 2019');
  });

  it('produces nothing while the vehicle is far from due', async () => {
    const { vehicleId, make } = await seedVehicle();
    await createRule(make, { serviceType: 'SERVICE_A', intervalKm: 50_000 });

    await recordOdometer(vehicleId, 100);

    const recommendations = await vehicleRecommendations(vehicleId);
    expect(recommendations).toHaveLength(0);
  });

  it('404s for a vehicle that does not exist', async () => {
    await get(
      harness,
      admin,
      '/api/vehicles/00000000-0000-0000-0000-000000000000/service-recommendations',
    ).expect(404);
  });

  it('reads a single recommendation by id', async () => {
    const { vehicleId, make } = await seedVehicle();
    await createRule(make, { serviceType: 'SERVICE_A', intervalKm: 1_000 });
    await recordOdometer(vehicleId, 900);
    const [serviceA] = await vehicleRecommendations(vehicleId);

    const response = serviceRecommendationResponseSchema.parse(
      jsonBody(
        await get(
          harness,
          admin,
          `/api/service-recommendations/${serviceA?.id}`,
        ).expect(200),
      ),
    );
    expect(response.recommendation.id).toBe(serviceA?.id);
  });

  it('404s for a recommendation that does not exist', async () => {
    await get(
      harness,
      admin,
      '/api/service-recommendations/00000000-0000-0000-0000-000000000000',
    ).expect(404);
  });
});

describe('B9.5 — accepting and dismissing', () => {
  it('records the actor and timestamp on accept', async () => {
    const { vehicleId, make } = await seedVehicle();
    await createRule(make, { serviceType: 'SERVICE_A', intervalKm: 1_000 });
    await recordOdometer(vehicleId, 900);

    const [serviceA] = await vehicleRecommendations(vehicleId);
    expect(serviceA).toBeDefined();

    const accepted = serviceRecommendationResponseSchema.parse(
      jsonBody(
        await post(
          harness,
          admin,
          `/api/service-recommendations/${serviceA?.id}/accept`,
        ).expect(200),
      ),
    );

    expect(accepted.recommendation.status).toBe('ACCEPTED');
    expect(accepted.recommendation.decidedByUserId).toBe(admin.userId);
    expect(accepted.recommendation.decidedAt).not.toBeNull();
  });

  it('dismisses a recommendation', async () => {
    const { vehicleId, make } = await seedVehicle();
    await createRule(make, { serviceType: 'SERVICE_A', intervalKm: 1_000 });
    await recordOdometer(vehicleId, 900);

    const [serviceA] = await vehicleRecommendations(vehicleId);

    const dismissed = serviceRecommendationResponseSchema.parse(
      jsonBody(
        await post(
          harness,
          admin,
          `/api/service-recommendations/${serviceA?.id}/dismiss`,
        ).expect(200),
      ),
    );

    expect(dismissed.recommendation.status).toBe('DISMISSED');
  });

  it('lets any authenticated staff member decide, not only ADMIN', async () => {
    const { vehicleId, make } = await seedVehicle();
    await createRule(make, { serviceType: 'SERVICE_A', intervalKm: 1_000 });
    await recordOdometer(vehicleId, 900);
    const [serviceA] = await vehicleRecommendations(vehicleId);

    const mechanic = await loginAs(harness, { role: 'MECHANIC' });
    await post(
      harness,
      mechanic,
      `/api/service-recommendations/${serviceA?.id}/accept`,
    ).expect(200);
  });

  it('404s for an unknown recommendation', async () => {
    await post(
      harness,
      admin,
      '/api/service-recommendations/00000000-0000-0000-0000-000000000000/accept',
    ).expect(404);
  });
});

describe('B9.4.3/B9.6.4 — recomputation preserves decisions and avoids duplicates', () => {
  it('keeps an accepted decision through a later recompute', async () => {
    const { vehicleId, make } = await seedVehicle();
    await createRule(make, { serviceType: 'SERVICE_A', intervalKm: 1_000 });
    await recordOdometer(vehicleId, 900);

    const [before] = await vehicleRecommendations(vehicleId);
    await post(
      harness,
      admin,
      `/api/service-recommendations/${before?.id}/accept`,
    ).expect(200);

    // A second odometer reading, still inside the same due window, forces
    // another recomputation.
    await recordOdometer(vehicleId, 950);

    const after = await vehicleRecommendations(vehicleId);
    expect(after).toHaveLength(1);
    expect(after[0]?.id).toBe(before?.id);
    expect(after[0]?.status).toBe('ACCEPTED');
    expect(after[0]?.decidedByUserId).toBe(admin.userId);
  });

  it('running recomputation twice does not create a duplicate row', async () => {
    const { vehicleId, make } = await seedVehicle();
    await createRule(make, { serviceType: 'SERVICE_A', intervalKm: 1_000 });

    await recordOdometer(vehicleId, 900);
    await recordOdometer(vehicleId, 910);
    await recordOdometer(vehicleId, 920);

    const recommendations = await vehicleRecommendations(vehicleId);
    expect(recommendations).toHaveLength(1);
  });

  it('removes advice that no longer holds once its rule is deactivated', async () => {
    const { vehicleId, make } = await seedVehicle();
    const rule = await createRule(make, {
      serviceType: 'SERVICE_A',
      intervalKm: 1_000,
    });
    await recordOdometer(vehicleId, 900);

    const [serviceA] = await vehicleRecommendations(vehicleId);
    await post(
      harness,
      admin,
      `/api/service-recommendations/${serviceA?.id}/accept`,
    ).expect(200);

    await patch(harness, admin, `/api/service-rules/${rule.id}`, {
      isActive: false,
    }).expect(200);

    // Any odometer change forces the next recomputation.
    await recordOdometer(vehicleId, 905);

    const after = await vehicleRecommendations(vehicleId);
    expect(after).toHaveLength(0);
  });
});

describe('B9.6.1 — recomputing on work-order completion', () => {
  it('reflects the out-odometer reading recorded at completion', async () => {
    const { vehicleId, make } = await seedVehicle();
    await createRule(make, { serviceType: 'SERVICE_B', intervalKm: 500 });

    const vehicle = await harness.app.prisma.vehicle.findUniqueOrThrow({
      where: { id: vehicleId },
      select: { customerId: true },
    });
    const created = jsonBody(
      await post(harness, admin, '/api/work-orders', {
        vehicleId,
        customerId: vehicle.customerId,
        description: 'Service',
      }).expect(201),
    );
    const workOrderId = String(
      (created as { workOrder: { id: string } }).workOrder.id,
    );

    await post(harness, admin, `/api/work-orders/${workOrderId}/lines`, {
      type: 'LABOUR',
      description: 'Service',
      quantity: '1',
      unit: 'HOUR',
      unitPriceOre: 89_500,
      vatRateBps: 2500,
    }).expect(201);

    // 1 400 km out, against a 500 km interval from a 0 km baseline: 900 km
    // past due.
    await completeWorkOrder(harness, admin, workOrderId, 1_400);

    const recommendations = await vehicleRecommendations(vehicleId);
    const serviceB = recommendations.find((r) => r.serviceType === 'SERVICE_B');
    expect(serviceB?.severity).toBe('OVERDUE');
    expect(serviceB?.dueKm).toBe(500);
  });
});

describe('listing filters', () => {
  it('filters the general list by status and severity', async () => {
    const { vehicleId, make } = await seedVehicle();
    await createRule(make, { serviceType: 'SERVICE_A', intervalKm: 1_000 });
    await recordOdometer(vehicleId, 900);
    const [serviceA] = await vehicleRecommendations(vehicleId);
    await post(
      harness,
      admin,
      `/api/service-recommendations/${serviceA?.id}/accept`,
    ).expect(200);

    const accepted = serviceRecommendationListResponseSchema.parse(
      jsonBody(
        await get(
          harness,
          admin,
          `/api/service-recommendations?status=ACCEPTED&severity=DUE_SOON`,
        ).expect(200),
      ),
    );
    expect(
      accepted.data.some(
        (recommendation) => recommendation.id === serviceA?.id,
      ),
    ).toBe(true);
    expect(accepted.data.every((r) => r.status === 'ACCEPTED')).toBe(true);
  });
});

describe('§5.3 — authorisation', () => {
  it('refuses an unauthenticated caller', async () => {
    const supertest = (await import('supertest')).default;
    await supertest(harness.app.server)
      .get('/api/service-recommendations')
      .expect(401);
  });
});
