import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  apiErrorSchema,
  formTokenResponseSchema,
  settingsResponseSchema,
  vehicleDetailSchema,
  vehicleLookupResponseSchema,
} from 'shared';
import { createTestApp, type TestApp } from './helpers/app.js';
import {
  anonymousAgent,
  loginAs,
  withAgent,
  type Agent,
} from './helpers/auth.js';
import { jsonBody } from './helpers/http.js';
import { vehicleLookupToken } from './helpers/vehicle-data.js';
import { get, patch, post } from './helpers/work-orders.js';

/**
 * B10.1–B10.4 — the vehicle-data provider, its cache, and the public lookup
 * (PROJECT_SPEC.md §6.1, §7.1).
 *
 * Each `describe` builds its own app: the circuit breaker and the daily
 * counters are process-wide state created once at registration, so sharing a
 * harness across tests that deliberately exhaust a ceiling or trip the
 * breaker would make the later tests measure the earlier ones' leftovers.
 */

async function setVehicleLookupLimits(
  harness: TestApp,
  admin: Agent,
  limits: { staff?: number; public?: number },
): Promise<void> {
  const current = settingsResponseSchema.parse(
    jsonBody(await get(harness, admin, '/api/settings').expect(200)),
  );

  await patch(harness, admin, '/api/settings', {
    operational: {
      ...current.operational,
      ...(limits.staff === undefined
        ? {}
        : { vehicleLookupDailyLimitStaff: limits.staff }),
      ...(limits.public === undefined
        ? {}
        : { vehicleLookupDailyLimitPublic: limits.public }),
    },
  }).expect(200);
}

describe('GET /api/public/vehicle-lookup-form-token (B10.4)', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp({ database: 'none' });
  });

  afterAll(async () => {
    await harness.close();
  });

  it('issues a token without a session or a database', async () => {
    const anon = await anonymousAgent(harness);
    const response = await get(
      harness,
      anon,
      '/api/public/vehicle-lookup-form-token',
    ).expect(200);

    const body = formTokenResponseSchema.parse(jsonBody(response));
    expect(body.token).toMatch(/^\d+\.[0-9a-f]{64}$/);
  });
});

describe('POST /api/public/vehicle-lookup — form token (B10.4.4, B10.4.8)', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('rejects a request with no token before any provider call', async () => {
    const anon = await anonymousAgent(harness);
    await post(harness, anon, '/api/public/vehicle-lookup', {
      registrationNumber: 'ABC12D',
    }).expect(400);
    expect(await harness.app.prisma.vehicle.count()).toBe(0);
  });

  it('rejects a forged token', async () => {
    const anon = await anonymousAgent(harness);
    await post(harness, anon, '/api/public/vehicle-lookup', {
      registrationNumber: 'ABC12D',
      formToken: `${String(Date.now())}.${'0'.repeat(64)}`,
    }).expect(400);
  });

  it('rejects a token older than two hours', async () => {
    const anon = await anonymousAgent(harness);
    await post(harness, anon, '/api/public/vehicle-lookup', {
      registrationNumber: 'ABC12D',
      formToken: vehicleLookupToken(harness, 2 * 60 * 60 + 60),
    }).expect(400);
  });

  it('accepts a token used immediately — there is no time trap here', async () => {
    const anon = await anonymousAgent(harness);
    const response = await post(harness, anon, '/api/public/vehicle-lookup', {
      registrationNumber: 'DEF456',
      formToken: vehicleLookupToken(harness),
    }).expect(200);

    const body = vehicleLookupResponseSchema.parse(jsonBody(response));
    expect(body.source).toBe('PROVIDER');
  });

  it('a booking-form token does not unlock the vehicle lookup', async () => {
    const anon = await anonymousAgent(harness);
    const bookingTokenResponse = await get(
      harness,
      anon,
      '/api/public/booking-form-token',
    ).expect(200);
    const bookingToken = formTokenResponseSchema.parse(
      jsonBody(bookingTokenResponse),
    ).token;

    await post(harness, anon, '/api/public/vehicle-lookup', {
      registrationNumber: 'ABC12D',
      formToken: bookingToken,
    }).expect(400);
  });
});

describe('POST /api/public/vehicle-lookup — the daily ceiling is a rate limit too', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('refuses the 6th lookup from one IP within an hour', async () => {
    const anon = await anonymousAgent(harness);
    for (let i = 0; i < 5; i += 1) {
      await post(harness, anon, '/api/public/vehicle-lookup', {
        // A different plate each time, so none of the five is served from
        // cache and each one genuinely counts against the per-IP limit.
        registrationNumber: `ZZZ00${String(i)}`,
        formToken: vehicleLookupToken(harness),
      }).expect(200);
    }

    await post(harness, anon, '/api/public/vehicle-lookup', {
      registrationNumber: 'ZZZ999',
      formToken: vehicleLookupToken(harness),
    }).expect(429);
  });
});

describe('the public lookup, its cache and its allow-list (B10.2, B10.4)', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await harness.close();
  });

  it('returns the mapped data for a known plate and never leaks an owner field', async () => {
    const anon = await anonymousAgent(harness);
    const response = await post(harness, anon, '/api/public/vehicle-lookup', {
      registrationNumber: 'ABC12D',
      formToken: vehicleLookupToken(harness),
    }).expect(200);

    const body = vehicleLookupResponseSchema.parse(jsonBody(response));
    expect(body.source).toBe('PROVIDER');
    expect(body.data?.make).toBe('Volvo');
    expect(body.data).not.toHaveProperty('ownerName');

    // The allow-list is enforced by the shared VehicleDataResult schema, which
    // has no field for it at all — asserted on the raw JSON body too, since a
    // schema that merely ignores an extra field would still let it pass.
    expect(response.text).not.toContain('ownerName');
  });

  it('creates an ownerless Vehicle row so the workshop can find the plate later', async () => {
    const vehicle = await harness.app.prisma.vehicle.findUnique({
      where: { registrationNumber: 'ABC12D' },
    });
    expect(vehicle).not.toBeNull();
    expect(vehicle?.customerId).toBeNull();
    expect(vehicle?.make).toBe('Volvo');
  });

  it('two simultaneous lookups of a brand-new plate create exactly one Vehicle row', async () => {
    // Two visitors asking about the same never-before-seen plate at once is
    // the race `persistLookupResult`'s `upsert` exists to close — a plain
    // find-then-create would let the second transaction crash on the unique
    // index instead of quietly joining the first.
    const anon = await anonymousAgent(harness);
    const request = () =>
      post(harness, anon, '/api/public/vehicle-lookup', {
        registrationNumber: 'GHI789',
        formToken: vehicleLookupToken(harness),
      });

    const [first, second] = await Promise.all([request(), request()]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    expect(
      await harness.app.prisma.vehicle.count({
        where: { registrationNumber: 'GHI789' },
      }),
    ).toBe(1);
  });

  it('a confirmed "no such registration number" is PROVIDER, not UNAVAILABLE', async () => {
    const anon = await anonymousAgent(harness);
    const response = await post(harness, anon, '/api/public/vehicle-lookup', {
      registrationNumber: 'QQQ111',
      formToken: vehicleLookupToken(harness),
    }).expect(200);

    const body = vehicleLookupResponseSchema.parse(jsonBody(response));
    expect(body.source).toBe('PROVIDER');
    expect(body.data).toBeNull();
    expect(body.unavailableReason).toBeNull();
    expect(
      await harness.app.prisma.vehicle.count({
        where: { registrationNumber: 'QQQ111' },
      }),
    ).toBe(0);
  });
});

/**
 * Isolated on its own harness: the daily counter is cumulative across every
 * call an app instance ever makes, so a test that lowers the ceiling mid-way
 * must not share a harness with a test that already spent part of the budget.
 */
describe('B10.2.4 — a second lookup within the TTL makes no provider call', () => {
  let harness: TestApp;
  let admin: Agent;

  beforeAll(async () => {
    harness = await createTestApp();
    admin = await loginAs(harness, { role: 'ADMIN' });
  }, 60_000);

  afterAll(async () => {
    await harness.close();
  });

  it('serves the second lookup from cache once the budget is spent', async () => {
    await setVehicleLookupLimits(harness, admin, { public: 1 });
    const anon = await anonymousAgent(harness);

    // Spends the whole (now tiny) public budget on the first, uncached call —
    // a known plate, so there is something to cache.
    const first = await post(harness, anon, '/api/public/vehicle-lookup', {
      registrationNumber: 'ABC12D',
      formToken: vehicleLookupToken(harness),
    }).expect(200);
    expect(vehicleLookupResponseSchema.parse(jsonBody(first)).source).toBe(
      'PROVIDER',
    );

    // If this second call touched the provider, the exhausted ceiling would
    // force a degraded UNAVAILABLE answer — getting CACHE back proves it did
    // not.
    const second = await post(harness, anon, '/api/public/vehicle-lookup', {
      registrationNumber: 'ABC12D',
      formToken: vehicleLookupToken(harness),
    }).expect(200);
    expect(vehicleLookupResponseSchema.parse(jsonBody(second)).source).toBe(
      'CACHE',
    );
  });
});

describe('degrading honestly when the provider cannot be reached (B10.3)', () => {
  let harness: TestApp;
  let admin: Agent;

  beforeAll(async () => {
    harness = await createTestApp();
    admin = await loginAs(harness, { role: 'ADMIN' });
  }, 60_000);

  afterAll(async () => {
    await harness.close();
  });

  it('a malformed provider response degrades to UNAVAILABLE, never a 500', async () => {
    const anon = await anonymousAgent(harness);
    const response = await post(harness, anon, '/api/public/vehicle-lookup', {
      registrationNumber: 'BAD0001',
      formToken: vehicleLookupToken(harness),
    }).expect(200);

    const body = vehicleLookupResponseSchema.parse(jsonBody(response));
    expect(body.source).toBe('UNAVAILABLE');
    expect(body.unavailableReason).toBe('PROVIDER_UNAVAILABLE');
    expect(body.data).toBeNull();
  });

  it('the exhausted public ceiling degrades to UNAVAILABLE with no cache', async () => {
    await setVehicleLookupLimits(harness, admin, { public: 0 });
    const anon = await anonymousAgent(harness);

    const response = await post(harness, anon, '/api/public/vehicle-lookup', {
      registrationNumber: 'SSS888',
      formToken: vehicleLookupToken(harness),
    }).expect(200);

    const body = vehicleLookupResponseSchema.parse(jsonBody(response));
    expect(body.source).toBe('UNAVAILABLE');
    expect(body.unavailableReason).toBe('PUBLIC_LIMIT_REACHED');
  });
});

/**
 * Its own harness, with `TRUST_PROXY` on: opening the breaker takes five
 * calls from one visitor, which alone spends that visitor's whole 5-per-hour
 * budget — so the sixth, proving-the-breaker-not-the-visitor call has to come
 * from a second, distinct IP, or a passing test could equally mean "IP
 * limiter", not "breaker".
 */
describe('B10.3.2 — five consecutive provider failures open the breaker', () => {
  let harness: TestApp;
  let admin: Agent;

  beforeAll(async () => {
    harness = await createTestApp({ env: { TRUST_PROXY: 'true' } });
    admin = await loginAs(harness, { role: 'ADMIN' });
  }, 60_000);

  afterAll(async () => {
    await harness.close();
  });

  function postFromIp(
    agent: Agent,
    body: Record<string, unknown>,
    ip: string,
  ): supertest.Test {
    return withAgent(
      supertest(harness.app.server).post('/api/public/vehicle-lookup'),
      agent,
    )
      .set('x-forwarded-for', ip)
      .send(body);
  }

  it('opens for every plate, not only the one that keeps failing', async () => {
    await setVehicleLookupLimits(harness, admin, { public: 100 });
    const anon = await anonymousAgent(harness);

    for (let i = 0; i < 5; i += 1) {
      await postFromIp(
        anon,
        {
          registrationNumber: 'BAD0001',
          formToken: vehicleLookupToken(harness),
        },
        '203.0.113.1',
      ).expect(200);
    }

    // A different visitor, asking about a plate the mock provider would
    // happily answer for — the breaker must refuse to ask at all.
    const response = await postFromIp(
      anon,
      { registrationNumber: 'DEF456', formToken: vehicleLookupToken(harness) },
      '203.0.113.2',
    ).expect(200);

    const body = vehicleLookupResponseSchema.parse(jsonBody(response));
    expect(body.source).toBe('UNAVAILABLE');
    expect(body.unavailableReason).toBe('PROVIDER_UNAVAILABLE');
  });
});

describe('the staff refresh button (B10.2.3)', () => {
  let harness: TestApp;
  let admin: Agent;
  let mechanic: Agent;
  let vehicleId: string;

  beforeAll(async () => {
    harness = await createTestApp();
    admin = await loginAs(harness, { role: 'ADMIN' });
    mechanic = await loginAs(harness, { role: 'MECHANIC' });

    const registrationNumber = 'DEF456';
    const created = await harness.app.prisma.vehicle.create({
      data: {
        registrationNumber,
        registrationNumberDisplay: registrationNumber,
        make: 'Okänt fabrikat',
        model: 'Okänd modell',
      },
      select: { id: true },
    });
    vehicleId = created.id;
  }, 60_000);

  afterAll(async () => {
    await harness.close();
  });

  it('is refused for a mechanic', async () => {
    await post(
      harness,
      mechanic,
      `/api/vehicles/${vehicleId}/vehicle-data/refresh`,
    ).expect(403);
  });

  it('fills in a placeholder vehicle with the provider result', async () => {
    const response = await post(
      harness,
      admin,
      `/api/vehicles/${vehicleId}/vehicle-data/refresh`,
    ).expect(200);

    const detail = vehicleDetailSchema.parse(jsonBody(response));
    expect(detail.make).toBe('Toyota');
    expect(detail.model).toBe('Corolla');
  });

  it('404s for a vehicle that does not exist', async () => {
    await post(
      harness,
      admin,
      '/api/vehicles/00000000-0000-0000-0000-000000000000/vehicle-data/refresh',
    ).expect(404);
  });

  it('throws rather than silently serving stale data once the staff ceiling is spent', async () => {
    await setVehicleLookupLimits(harness, admin, { staff: 0 });

    const response = await post(
      harness,
      admin,
      `/api/vehicles/${vehicleId}/vehicle-data/refresh`,
    ).expect(429);
    expect(apiErrorSchema.parse(jsonBody(response)).error.code).toBe(
      'RATE_LIMITED',
    );
  });
});
