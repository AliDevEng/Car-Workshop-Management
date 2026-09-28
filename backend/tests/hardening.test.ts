import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import { ORE_MAX, apiErrorSchema, settingsResponseSchema } from 'shared';
import { expireOverdueQuotes } from '../src/modules/quotes/service.js';
import { runQuoteExpirySweep } from '../src/jobs/quote-expiry.js';
import { DEFAULT_SCHEDULES } from '../src/jobs/scheduler.js';
import { createTestApp, type TestApp } from './helpers/app.js';
import { loginAs, withAgent, type Agent } from './helpers/auth.js';
import { submit, validSubmission } from './helpers/bookings.js';
import { jsonBody } from './helpers/http.js';
import {
  completeWorkOrder,
  get,
  patch,
  post,
  seedArticle,
  seedSubject,
} from './helpers/work-orders.js';

/**
 * Failures found by probing the running system rather than by reading it, each
 * reproduced here first and fixed second.
 *
 * Every case below **failed on the code as it stood**: eight answered
 * `500 INTERNAL_ERROR` where §3.7 requires a Swedish field-level message, one
 * reversed the stock ledger, one discarded a concurrent write silently, one
 * retained personal data through an erasure request, and one scheduled job did
 * not exist. They are kept together rather than scattered into the module
 * suites because what they have in common is how they were found — none is
 * reachable from a screen, and all of them are reachable from an API a tablet
 * on a garage wi-fi can reach.
 */

let harness: TestApp;
let admin: Agent;

function errorBody(response: supertest.Response): {
  code: string;
  message: string;
} {
  return apiErrorSchema.parse(jsonBody(response)).error;
}

async function newWorkOrder(): Promise<{ id: string; version: number }> {
  const subject = await seedSubject(harness);
  const response = await post(harness, admin, '/api/work-orders', {
    vehicleId: subject.vehicleId,
    customerId: subject.customerId,
    description: 'Hårdningstest',
  }).expect(201);
  const body = jsonBody(response);
  const order = (body as { workOrder: { id: string; version: number } })
    .workOrder;
  return { id: order.id, version: order.version };
}

beforeAll(async () => {
  harness = await createTestApp();
  admin = await loginAs(harness, { role: 'ADMIN' });
}, 180_000);

afterAll(async () => {
  await harness.close();
});

// --- Money that does not fit its column (§3.2) -------------------------------

describe('an amount larger than a money column', () => {
  it('is a Swedish 400 on an article price, not a 500', async () => {
    const response = await post(harness, admin, '/api/articles', {
      sku: `H1-${crypto.randomUUID()}`,
      name: 'Orimligt dyr artikel',
      unit: 'PIECE',
      // Passed `Number.isSafeInteger`, so it used to reach Postgres and come
      // back as `500 INTERNAL_ERROR` with a request id and nothing actionable.
      salesPriceOre: ORE_MAX + 1,
    }).expect(400);

    expect(errorBody(response).code).toBe('VALIDATION_FAILED');
  });

  it('still accepts the largest amount the column can hold', async () => {
    await post(harness, admin, '/api/articles', {
      sku: `H2-${crypto.randomUUID()}`,
      name: 'Precis inom gränsen',
      unit: 'PIECE',
      salesPriceOre: ORE_MAX,
    }).expect(201);
  });

  it('is a Swedish 400 on an hourly rate in settings, not a silent 200', async () => {
    const current = settingsResponseSchema.parse(
      jsonBody(await get(harness, admin, '/api/settings').expect(200)),
    );

    const response = await patch(harness, admin, '/api/settings', {
      operational: {
        ...current.operational,
        defaultHourlyRateOre: 9_000_000_000,
      },
      expectedUpdatedAt: { operational: current.updatedAt.operational },
    }).expect(400);

    expect(errorBody(response).code).toBe('VALIDATION_FAILED');
  });
});

describe('a work order that totals more than a money column', () => {
  it('is still readable — totals are computed, not stored (§3.3)', async () => {
    const order = await newWorkOrder();
    for (let i = 0; i < 3; i += 1) {
      await post(harness, admin, `/api/work-orders/${order.id}/lines`, {
        type: 'FEE',
        description: `Stor post ${String(i)}`,
        quantity: '1',
        unit: 'PIECE',
        unitPriceOre: 1_000_000_000,
        vatRateBps: 2500,
      }).expect(201);
    }

    const detail = jsonBody(
      await get(harness, admin, `/api/work-orders/${order.id}`).expect(200),
    ) as { totals: { grossOre: number } };

    expect(detail.totals.grossOre).toBeGreaterThan(ORE_MAX);
  });

  it('refuses to freeze those totals onto a quote, in Swedish', async () => {
    const order = await newWorkOrder();
    for (let i = 0; i < 3; i += 1) {
      await post(harness, admin, `/api/work-orders/${order.id}/lines`, {
        type: 'FEE',
        description: `Stor post ${String(i)}`,
        quantity: '1',
        unit: 'PIECE',
        unitPriceOre: 1_000_000_000,
        vatRateBps: 2500,
      }).expect(201);
    }

    const response = await post(
      harness,
      admin,
      `/api/work-orders/${order.id}/quotes`,
      {},
    ).expect(409);

    expect(errorBody(response).code).toBe('CONFLICT');
    expect(errorBody(response).message).toContain('för stor');
  });
});

// --- The stock ledger cannot be driven backwards (§4.2, §6.4) ----------------

describe('a negative quantity on a line that names an article', () => {
  it('is refused, because completion would add the part to the shelf', async () => {
    const order = await newWorkOrder();
    const articleId = await seedArticle(harness, admin.userId, {
      openingStock: '10',
    });

    const response = await post(
      harness,
      admin,
      `/api/work-orders/${order.id}/lines`,
      {
        type: 'PART',
        articleId,
        description: 'Motorolja 5W-30',
        quantity: '-5',
        unit: 'LITRE',
        unitPriceOre: 12_999,
        vatRateBps: 2500,
      },
    ).expect(400);

    expect(errorBody(response).code).toBe('VALIDATION_FAILED');
  });

  it('cannot be smuggled in by patching the quantity afterwards', async () => {
    const order = await newWorkOrder();
    const articleId = await seedArticle(harness, admin.userId, {
      openingStock: '10',
    });
    const created = jsonBody(
      await post(harness, admin, `/api/work-orders/${order.id}/lines`, {
        type: 'PART',
        articleId,
        description: 'Motorolja 5W-30',
        quantity: '5',
        unit: 'LITRE',
        unitPriceOre: 12_999,
        vatRateBps: 2500,
      }).expect(201),
    ) as { workOrder: { lines: { id: string }[] } };

    const lineId = created.workOrder.lines[0]?.id ?? '';

    // The patch names only `quantity`, so a rule reading the request body on
    // its own would see no `type` and no `articleId` and let this through.
    await patch(
      harness,
      admin,
      `/api/work-orders/${order.id}/lines/${lineId}`,
      { quantity: '-5' },
    ).expect(400);
  });

  it('cannot be smuggled in by attaching an article to an existing line', async () => {
    const order = await newWorkOrder();
    const articleId = await seedArticle(harness, admin.userId);
    const created = jsonBody(
      await post(harness, admin, `/api/work-orders/${order.id}/lines`, {
        // No article, so a negative quantity is legitimate here: a credited
        // labour line is a real thing and stays allowed.
        type: 'LABOUR',
        description: 'Kreditering',
        quantity: '-1',
        unit: 'HOUR',
        unitPriceOre: 89_500,
        vatRateBps: 2500,
      }).expect(201),
    ) as { workOrder: { lines: { id: string }[] } };

    const lineId = created.workOrder.lines[0]?.id ?? '';

    await patch(
      harness,
      admin,
      `/api/work-orders/${order.id}/lines/${lineId}`,
      { type: 'PART', articleId },
    ).expect(400);
  });

  it('leaves the shelf balance falling when a job is completed', async () => {
    const order = await newWorkOrder();
    const articleId = await seedArticle(harness, admin.userId, {
      openingStock: '10',
    });
    await post(harness, admin, `/api/work-orders/${order.id}/lines`, {
      type: 'PART',
      articleId,
      description: 'Motorolja 5W-30',
      quantity: '4',
      unit: 'LITRE',
      unitPriceOre: 12_999,
      vatRateBps: 2500,
    }).expect(201);

    // Re-read: a line write bumps the parent version (§6.5), so the version
    // captured at creation is already stale.
    const current = jsonBody(
      await get(harness, admin, `/api/work-orders/${order.id}`).expect(200),
    ) as { version: number };

    await post(harness, admin, `/api/work-orders/${order.id}/status`, {
      status: 'IN_PROGRESS',
      version: current.version,
    }).expect(200);
    await post(harness, admin, `/api/work-orders/${order.id}/status`, {
      status: 'COMPLETED',
      version: current.version + 1,
      odometerKmOut: 12_000,
    }).expect(200);

    const article = await harness.app.prisma.article.findUniqueOrThrow({
      where: { id: articleId },
      select: { stockQuantity: true },
    });
    expect(article.stockQuantity.toString()).toBe('6');
  });
});

// --- Text a column cannot hold (§3.7) ---------------------------------------

describe('a control character in a text field', () => {
  it('is a Swedish 400, not a Postgres encoding error', async () => {
    const response = await post(harness, admin, '/api/customers', {
      type: 'PRIVATE',
      name: 'Anna Svensson',
      phone: '070-123 45 67',
    }).expect(400);

    expect(errorBody(response).code).toBe('VALIDATION_FAILED');
  });

  it('does not get in the way of a Swedish name', async () => {
    await post(harness, admin, '/api/customers', {
      type: 'PRIVATE',
      name: 'Ångström Ödegård',
      phone: '070-123 45 67',
    }).expect(201);
  });
});

// --- An odometer reading cannot be dated in the future (§3.5) ----------------

describe('an odometer reading dated in the future', () => {
  it('is refused', async () => {
    const subject = await seedSubject(harness);
    const response = await post(
      harness,
      admin,
      `/api/vehicles/${subject.vehicleId}/odometer-readings`,
      {
        km: 999_000,
        readAt: new Date(Date.now() + 5 * 365 * 24 * 3600_000).toISOString(),
      },
    ).expect(400);

    expect(errorBody(response).code).toBe('VALIDATION_FAILED');
  });

  it('leaves the cached reading describing the newest real one', async () => {
    const subject = await seedSubject(harness);
    await post(
      harness,
      admin,
      `/api/vehicles/${subject.vehicleId}/odometer-readings`,
      { km: 12_000 },
    ).expect(201);

    const vehicle = await harness.app.prisma.vehicle.findUniqueOrThrow({
      where: { id: subject.vehicleId },
      select: { lastKnownOdometerKm: true },
    });
    // The cache mirrors the newest reading *by `readAt`*, so a reading dated
    // in 2031 used to win this comparison against every real reading until
    // 2031 — permanently, because nothing later is newer.
    expect(vehicle.lastKnownOdometerKm).toBe(12_000);
  });

  it('still accepts a back-dated correction', async () => {
    const subject = await seedSubject(harness);
    await post(
      harness,
      admin,
      `/api/vehicles/${subject.vehicleId}/odometer-readings`,
      {
        km: 11_000,
        readAt: new Date(Date.now() - 30 * 24 * 3600_000).toISOString(),
      },
    ).expect(201);
  });
});

// --- Settings are not last-write-wins (§6.5's reasoning) --------------------

describe('two admins editing the same settings group', () => {
  it('refuses the second write rather than discarding the first', async () => {
    const before = settingsResponseSchema.parse(
      jsonBody(await get(harness, admin, '/api/settings').expect(200)),
    );

    const [first, second] = await Promise.all([
      patch(harness, admin, '/api/settings', {
        workshop: { ...before.workshop, name: 'Namn A' },
        expectedUpdatedAt: { workshop: before.updatedAt.workshop },
      }),
      patch(harness, admin, '/api/settings', {
        workshop: { ...before.workshop, city: 'Ort B' },
        expectedUpdatedAt: { workshop: before.updatedAt.workshop },
      }),
    ]);

    const statuses = [first.status, second.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);

    const after = settingsResponseSchema.parse(
      jsonBody(await get(harness, admin, '/api/settings').expect(200)),
    );
    // Whichever won, the loser was told — rather than both being answered 200
    // and one edit vanishing, which is what used to happen.
    const winnerApplied =
      after.workshop.name === 'Namn A' || after.workshop.city === 'Ort B';
    expect(winnerApplied).toBe(true);
  });

  it('still lets a caller without a token write, for the seed and B12', async () => {
    const before = settingsResponseSchema.parse(
      jsonBody(await get(harness, admin, '/api/settings').expect(200)),
    );
    await patch(harness, admin, '/api/settings', {
      workshop: { ...before.workshop, name: 'Skriv utan token' },
    }).expect(200);
  });
});

// --- Erasure reaches the booking requests too (§5.5) ------------------------

describe('anonymising a customer', () => {
  it('erases the personal data on their booking requests', async () => {
    const customer = await harness.app.prisma.customer.create({
      data: {
        type: 'PRIVATE',
        name: 'Bertil Unik',
        phone: '070-999 88 77',
        phoneNormalised: '+46709998877',
        email: 'bertil.unik@example.se',
      },
      select: { id: true },
    });
    const request = await harness.app.prisma.bookingRequest.create({
      data: {
        // `CONFIRMED`, which the 90-day retention rule never touches — so this
        // row kept a real name, telephone number and e-mail address for ever.
        status: 'CONFIRMED',
        customerName: 'Bertil Unik',
        phone: '070-999 88 77',
        email: 'bertil.unik@example.se',
        message: 'Bor på Storgatan 4, ring innan.',
        serviceTypeIds: [],
        sourceIpHash: 'hash',
      },
      select: { id: true },
    });
    await harness.app.prisma.booking.create({
      data: {
        bookingRequestId: request.id,
        customerId: customer.id,
        startsAt: new Date('2026-10-01T08:00:00Z'),
        endsAt: new Date('2026-10-01T09:00:00Z'),
      },
    });

    await post(
      harness,
      admin,
      `/api/customers/${customer.id}/anonymise`,
      {},
    ).expect(200);

    const after = await harness.app.prisma.bookingRequest.findUniqueOrThrow({
      where: { id: request.id },
      select: {
        customerName: true,
        phone: true,
        email: true,
        message: true,
        anonymisedAt: true,
      },
    });

    expect(after.customerName).toBe('Raderad förfrågan');
    expect(after.phone).not.toContain('999');
    expect(after.email).toBeNull();
    expect(after.message).toBeNull();
    expect(after.anonymisedAt).not.toBeNull();
  });

  it('records it in the audit log, like every other erasure', async () => {
    const entries = await harness.app.prisma.auditLog.count({
      where: { action: 'booking_request.anonymised' },
    });
    expect(entries).toBeGreaterThan(0);
  });

  it('leaves a stranger’s unconfirmed request alone', async () => {
    const customer = await harness.app.prisma.customer.create({
      data: {
        type: 'PRIVATE',
        name: 'Cecilia Annan',
        phone: '070-111 22 33',
        phoneNormalised: '+46701112233',
      },
      select: { id: true },
    });
    const unrelated = await harness.app.prisma.bookingRequest.create({
      data: {
        status: 'PENDING',
        // The same name and number, and still not theirs: nothing in the
        // system says so, and matching on a coincidence would erase a
        // stranger's request.
        customerName: 'Cecilia Annan',
        phone: '070-111 22 33',
        serviceTypeIds: [],
        sourceIpHash: 'hash',
      },
      select: { id: true },
    });

    await post(
      harness,
      admin,
      `/api/customers/${customer.id}/anonymise`,
      {},
    ).expect(200);

    const after = await harness.app.prisma.bookingRequest.findUniqueOrThrow({
      where: { id: unrelated.id },
      select: { customerName: true, anonymisedAt: true },
    });
    expect(after.customerName).toBe('Cecilia Annan');
    expect(after.anonymisedAt).toBeNull();
  });
});

// --- The audit-log filter a date control can actually drive -----------------

describe('the audit-log date filter', () => {
  it('accepts a plain calendar date', async () => {
    await get(
      harness,
      admin,
      '/api/audit-log?from=2026-01-01&to=2026-12-31',
    ).expect(200);
  });

  it('reads a bare `to` as the end of that Stockholm day, not its midnight', async () => {
    const at = new Date('2026-06-15T20:00:00.000Z');
    await harness.app.prisma.auditLog.create({
      data: {
        action: 'hardening.probe',
        entityType: 'Probe',
        entityId: crypto.randomUUID(),
        at,
      },
    });

    const response = jsonBody(
      await get(
        harness,
        admin,
        '/api/audit-log?entityType=Probe&from=2026-06-15&to=2026-06-15',
      ).expect(200),
    ) as { data: unknown[] };

    expect(response.data.length).toBe(1);
  });
});

// --- The sliding session actually slides (§5.1) -----------------------------

describe('a session that is touched', () => {
  it('reissues its cookie so the browser copy slides too', async () => {
    const agent = await loginAs(harness, { role: 'MECHANIC' });

    // The touch only happens once a minute, so the row is aged deliberately
    // rather than by waiting: it is the *effect* that matters here.
    await harness.app.prisma.session.updateMany({
      where: { userId: agent.userId },
      data: { lastSeenAt: new Date(Date.now() - 10 * 60 * 1000) },
    });

    const response = await get(harness, agent, '/api/auth/me').expect(200);
    const setCookie: unknown = response.headers['set-cookie'];
    const cookies = Array.isArray(setCookie) ? setCookie.map(String) : [];

    expect(cookies.some((value) => value.startsWith('verkstad_session='))).toBe(
      true,
    );
  });

  it('does not reissue it on every request', async () => {
    const agent = await loginAs(harness, { role: 'MECHANIC' });
    const response = await get(harness, agent, '/api/auth/me').expect(200);
    const setCookie: unknown = response.headers['set-cookie'];
    const cookies = Array.isArray(setCookie) ? setCookie.map(String) : [];

    expect(cookies.some((value) => value.startsWith('verkstad_session='))).toBe(
      false,
    );
  });
});

// --- The quote-expiry sweep is wired to something (§8.4) --------------------

describe('quote expiry', () => {
  it('has a scheduled job, which is what B7 recorded and B11 did not ship', () => {
    expect(Object.keys(DEFAULT_SCHEDULES)).toContain('quoteExpiry');
  });

  it('marks an overdue sent quote as expired when the job runs', async () => {
    const order = await newWorkOrder();
    await post(harness, admin, `/api/work-orders/${order.id}/lines`, {
      type: 'LABOUR',
      description: 'Service',
      quantity: '1',
      unit: 'HOUR',
      unitPriceOre: 89_500,
      vatRateBps: 2500,
    }).expect(201);

    const created = jsonBody(
      await post(
        harness,
        admin,
        `/api/work-orders/${order.id}/quotes`,
        {},
      ).expect(201),
    ) as { quote: { id: string } };

    await harness.app.prisma.quote.update({
      where: { id: created.quote.id },
      data: { status: 'SENT', validUntil: new Date('2026-01-01T00:00:00Z') },
    });

    const result = await runQuoteExpirySweep(
      harness.app.prisma,
      { info: () => undefined, warn: () => undefined, error: () => undefined },
      new Date('2026-06-01T10:00:00Z'),
    );

    expect(result.expired).toBeGreaterThanOrEqual(1);
    const after = await harness.app.prisma.quote.findUniqueOrThrow({
      where: { id: created.quote.id },
      select: { status: true },
    });
    expect(after.status).toBe('EXPIRED');
  });

  it('is still callable on its own, for the B7 tests that own the rule', async () => {
    const result = await expireOverdueQuotes(harness.app.prisma);
    expect(result.expired).toBeGreaterThanOrEqual(0);
  });
});

// --- Array fields cannot be used as a payload ------------------------------

describe('an article with thousands of OE numbers', () => {
  it('is refused rather than GIN-indexed', async () => {
    const response = await withAgent(
      supertest(harness.app.server).post('/api/articles'),
      admin,
    )
      .send({
        sku: `H9-${crypto.randomUUID()}`,
        name: 'Alla OE-nummer',
        unit: 'PIECE',
        salesPriceOre: 100,
        oeNumbers: Array.from({ length: 5000 }, (_, i) => `OE${String(i)}`),
      })
      .expect(400);

    expect(errorBody(response).code).toBe('VALIDATION_FAILED');
  });
});

// --- Found by the 2026-09-28 probe of the running system ---------------------

describe('a partial article update', () => {
  async function newArticle(): Promise<string> {
    const response = await post(harness, admin, '/api/articles', {
      sku: `H2-${crypto.randomUUID()}`,
      name: 'Motorolja 5W-30',
      unit: 'LITRE',
      salesPriceOre: 12_900,
      purchasePriceOre: 8_000,
      vatRateBps: 1200,
      minimumQuantity: '20',
      location: 'Hylla B3',
      oeNumbers: ['A0009898301'],
    }).expect(201);
    return (jsonBody(response) as { id: string }).id;
  }

  it('leaves the fields it does not name alone', async () => {
    const id = await newArticle();
    // `.partial()` over the create schema re-applied its defaults, so this
    // rename reset VAT to 25 %, the minimum to 0 and erased the OE numbers.
    await patch(harness, admin, `/api/articles/${id}`, {
      name: 'Motorolja 5W-30 Longlife',
    }).expect(200);

    const after = await harness.app.prisma.article.findUniqueOrThrow({
      where: { id },
    });
    expect(after.vatRateBps).toBe(1200);
    expect(after.minimumQuantity.toString()).toBe('20');
    expect(after.oeNumbers).toEqual(['A0009898301']);
  });

  it('clears a nullable field with null (§8.1)', async () => {
    const id = await newArticle();
    await patch(harness, admin, `/api/articles/${id}`, {
      purchasePriceOre: null,
      location: null,
      description: null,
    }).expect(200);

    const after = await harness.app.prisma.article.findUniqueOrThrow({
      where: { id },
    });
    expect(after.purchasePriceOre).toBeNull();
    expect(after.location).toBeNull();
  });

  it('does not turn a mechanic’s shelf edit into a price change', async () => {
    const id = await newArticle();
    const mechanic = await loginAs(harness, { role: 'MECHANIC' });
    await patch(harness, mechanic, `/api/articles/${id}`, {
      location: 'Hylla C1',
    }).expect(200);
  });
});

describe('a NUL byte where nothing stores it', () => {
  it('is a 400 on a list search, not a Postgres encoding error', async () => {
    for (const path of ['/api/customers', '/api/vehicles', '/api/articles']) {
      const response = await get(harness, admin, `${path}?q=%00`).expect(400);
      expect(errorBody(response).code).toBe('VALIDATION_FAILED');
    }
  });

  it('is a 400 in a public booking request’s plate and services', async () => {
    const plate = await submit(
      harness,
      validSubmission(harness, { regNr: 'AB\u0000123' }),
    ).expect(400);
    expect(errorBody(plate).code).toBe('VALIDATION_FAILED');

    const services = await submit(
      harness,
      validSubmission(harness, { serviceTypeIds: ['bil\u0000service'] }),
    ).expect(400);
    expect(errorBody(services).code).toBe('VALIDATION_FAILED');
  });
});

describe('a routing failure', () => {
  it('answers in the §3.7 envelope, not in Fastify’s own shape', async () => {
    const tooLong = await get(
      harness,
      admin,
      `/api/customers/${'x'.repeat(300)}`,
    );
    expect(tooLong.status).toBeGreaterThanOrEqual(400);
    expect(errorBody(tooLong).message).toMatch(/[åäö]|Förfrågan/);

    const badEncoding = await get(harness, admin, '/api/customers/%E0%A4%A');
    expect(badEncoding.status).toBe(400);
    expect(errorBody(badEncoding).code).toBe('VALIDATION_FAILED');
  });
});

describe('a completed work order’s header', () => {
  it('refuses a change to what the documents print, and still takes a note', async () => {
    const order = await newWorkOrder();
    await post(harness, admin, `/api/work-orders/${order.id}/lines`, {
      type: 'LABOUR',
      description: 'Service',
      quantity: '1',
      unit: 'HOUR',
      unitPriceOre: 89_500,
      vatRateBps: 2500,
    }).expect(201);
    await completeWorkOrder(harness, admin, order.id);
    const current = jsonBody(
      await get(harness, admin, `/api/work-orders/${order.id}`).expect(200),
    ) as { version: number };

    const refused = await patch(
      harness,
      admin,
      `/api/work-orders/${order.id}`,
      {
        description: 'Omskriven i efterhand',
        version: current.version,
      },
    ).expect(409);
    expect(errorBody(refused).code).toBe('CONFLICT');

    await patch(harness, admin, `/api/work-orders/${order.id}`, {
      internalNote: 'Kunden hämtade bilen själv.',
      version: current.version,
    }).expect(200);
  });
});

describe('a quote’s validity date', () => {
  async function draftQuote(): Promise<string> {
    const order = await newWorkOrder();
    await post(harness, admin, `/api/work-orders/${order.id}/lines`, {
      type: 'LABOUR',
      description: 'Felsökning',
      quantity: '1',
      unit: 'HOUR',
      unitPriceOre: 85_000,
      vatRateBps: 2500,
    }).expect(201);
    const created = jsonBody(
      await post(
        harness,
        admin,
        `/api/work-orders/${order.id}/quotes`,
        {},
      ).expect(201),
    ) as { quote: { id: string } };
    return created.quote.id;
  }

  it('may not be set in the past', async () => {
    const id = await draftQuote();
    const response = await patch(harness, admin, `/api/quotes/${id}`, {
      validUntil: '2000-01-01',
    }).expect(400);
    expect(errorBody(response).code).toBe('VALIDATION_FAILED');
  });

  it('stops a draft that has lapsed from being sent', async () => {
    const id = await draftQuote();
    await harness.app.prisma.quote.update({
      where: { id },
      data: { validUntil: new Date('2000-01-01T00:00:00Z') },
    });
    const response = await post(
      harness,
      admin,
      `/api/quotes/${id}/send`,
      undefined,
    ).expect(409);
    expect(errorBody(response).code).toBe('CONFLICT');
  });
});
