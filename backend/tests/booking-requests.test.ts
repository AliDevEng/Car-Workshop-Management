import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  apiErrorSchema,
  bookingRequestListResponseSchema,
  bookingRequestSchema,
  formTokenResponseSchema,
  publicBookingRequestResponseSchema,
} from 'shared';
import { createTestApp, type TestApp } from './helpers/app.js';
import { jsonBody } from './helpers/http.js';
import { loginAs, withAgent, type Agent } from './helpers/auth.js';
import {
  agedFormToken,
  seedBookingRequest,
  submit,
  validSubmission,
} from './helpers/bookings.js';

/**
 * B5.1–B5.3 — the public booking form and the staff inbox (PROJECT_SPEC.md
 * §5.5, §6.2).
 *
 * §6.2's anti-spam is four independent layers, and B5.2.6 asks for each to be
 * tested on its own. Each `describe` below therefore builds its own app: the
 * limiters are per-instance and per-IP, so a shared harness would leave the
 * later tests measuring the earlier ones' leftovers rather than the rule.
 */

describe('GET /api/public/booking-form-token (B5.2.2)', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp({ database: 'none' });
  });

  afterAll(async () => {
    await harness.close();
  });

  it('issues a token without a session or a database', async () => {
    const response = await supertest(harness.app.server)
      .get('/api/public/booking-form-token')
      .expect(200);

    const body = formTokenResponseSchema.parse(jsonBody(response));
    expect(body.token).toMatch(/^\d+\.[0-9a-f]{64}$/);
  });
});

describe('the anti-spam layers refuse before anything is written (B5.2)', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  async function assertNothingStored(): Promise<void> {
    expect(await harness.app.prisma.bookingRequest.count()).toBe(0);
  }

  it('rejects a filled honeypot (B5.2.1)', async () => {
    const response = await submit(
      harness,
      validSubmission(harness, { website: 'https://spam.example' }),
    ).expect(400);

    expect(apiErrorSchema.parse(jsonBody(response)).error.code).toBe(
      'VALIDATION_FAILED',
    );
    await assertNothingStored();
  });

  it('rejects a submission with no form token at all', async () => {
    const body = validSubmission(harness);
    delete body['formToken'];
    await submit(harness, body).expect(400);
    await assertNothingStored();
  });

  it('rejects a forged token (B5.2.2)', async () => {
    await submit(
      harness,
      validSubmission(harness, {
        formToken: `${String(Date.now() - 10_000)}.${'0'.repeat(64)}`,
      }),
    ).expect(400);
    await assertNothingStored();
  });

  it('rejects a submission faster than three seconds (B5.2.3)', async () => {
    // The token the endpoint has just issued: a human cannot have filled the
    // form in yet, and that is the whole trap.
    const issued = formTokenResponseSchema.parse(
      jsonBody(
        await supertest(harness.app.server)
          .get('/api/public/booking-form-token')
          .expect(200),
      ),
    );

    await submit(
      harness,
      validSubmission(harness, { formToken: issued.token }),
    ).expect(400);
    await assertNothingStored();
  });

  it('rejects a token older than two hours (B5.2.3)', async () => {
    await submit(
      harness,
      validSubmission(harness, {
        formToken: agedFormToken(harness, 2 * 60 * 60 + 60),
      }),
    ).expect(400);
    await assertNothingStored();
  });

  it('answers every token failure with the same message', async () => {
    // Four different reasons, one sentence: telling a bot which layer caught
    // it is how it learns to get past the next one.
    const messages = await Promise.all(
      [
        `${String(Date.now())}.${'0'.repeat(64)}`,
        agedFormToken(harness, 2 * 60 * 60 + 60),
        'not-a-token',
      ].map(async (formToken) => {
        const response = await submit(
          harness,
          validSubmission(harness, { formToken }),
        ).expect(400);
        return apiErrorSchema.parse(jsonBody(response)).error.message;
      }),
    );

    expect(new Set(messages).size).toBe(1);
  });
});

describe('an accepted public submission (B5.1)', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('stores the request, normalises the plate and hashes the IP', async () => {
    const response = await submit(
      harness,
      validSubmission(harness, {
        email: 'anna@example.se',
        requestedDate: '2026-04-14',
        requestedTimeOfDay: 'MORNING',
        message: 'Bilen låter konstigt fram till vänster.',
        serviceTypeIds: ['service', 'bromsar'],
      }),
    ).expect(201);

    // Deliberately thin: the request id would let anyone poll someone else's
    // submission, and there is nothing useful for a visitor to poll for.
    expect(
      publicBookingRequestResponseSchema.parse(jsonBody(response)),
    ).toEqual({ received: true });

    const stored = await harness.app.prisma.bookingRequest.findFirstOrThrow();
    expect(stored.status).toBe('PENDING');
    // Normalised when present (B5.1.3), so confirmation can match the plate
    // against `Vehicle.registrationNumber` exactly rather than by spacing.
    expect(stored.regNr).toBe('ABC12D');
    expect(stored.requestedTimeOfDay).toBe('MORNING');
    expect(stored.serviceTypeIds).toEqual(['service', 'bromsar']);
    // A salted SHA-256, never the address (§5.5, B5.1.4).
    expect(stored.sourceIpHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.sourceIpHash).not.toContain('127.0.0.1');
  });

  it('flags a spam-looking submission rather than refusing it (B5.2.5)', async () => {
    await submit(
      harness,
      validSubmission(harness, {
        customerName: 'Владимир Петров',
        message: 'best prices at bestdeals.xyz',
        regNr: undefined,
      }),
    ).expect(201);

    const stored = await harness.app.prisma.bookingRequest.findFirstOrThrow({
      where: { customerName: 'Владимир Петров' },
    });
    expect(stored.status).toBe('SPAM');
    expect(stored.regNr).toBeNull();
  });
});

describe('the per-IP submission limit (B5.2.4)', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('accepts three an hour and refuses the fourth', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await submit(harness, validSubmission(harness)).expect(201);
    }

    const response = await submit(harness, validSubmission(harness)).expect(
      429,
    );
    expect(apiErrorSchema.parse(jsonBody(response)).error.code).toBe(
      'RATE_LIMITED',
    );
    expect(await harness.app.prisma.bookingRequest.count()).toBe(3);
  });
});

describe('the global daily ceiling (B5.2.4)', () => {
  let harness: TestApp;

  beforeAll(async () => {
    // `X-Forwarded-For` is only honoured with TRUST_PROXY on — which is also
    // what B12 must set, since Caddy sits in front (§2.3).
    harness = await createTestApp({ env: { TRUST_PROXY: 'true' } });
  });

  afterAll(async () => {
    await harness.close();
  });

  it('stops at twenty a day, and a blocked IP does not spend that budget', async () => {
    let accepted = 0;

    // Ten addresses, five attempts each. The per-IP limit refuses attempts
    // four and five of every address, so at most thirty reach the global
    // bucket — and exactly twenty of those may be stored.
    for (let address = 0; address < 10; address += 1) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await submit(
          harness,
          validSubmission(harness),
          `203.0.113.${String(address + 1)}`,
        );
        if (response.status === 201) {
          accepted += 1;
        }
      }
    }

    // The number is the assertion. If a submission refused by the per-IP
    // bucket also consumed a slot from the global one, twenty visitors' worth
    // of budget would be gone after seven abusive addresses, and this would be
    // smaller than twenty.
    expect(accepted).toBe(20);
    expect(await harness.app.prisma.bookingRequest.count()).toBe(20);
  }, 30_000);
});

describe('the staff inbox (B5.3.1, B5.3.2)', () => {
  let harness: TestApp;
  let staff: Agent;

  beforeAll(async () => {
    harness = await createTestApp();
    staff = await loginAs(harness);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('requires a login', async () => {
    await supertest(harness.app.server)
      .get('/api/booking-requests')
      .expect(401);
  });

  it('lists requests newest first with the unhandled count', async () => {
    const first = await seedBookingRequest(harness, { customerName: 'Först' });
    const second = await seedBookingRequest(harness, { customerName: 'Sedan' });
    await seedBookingRequest(harness, {
      customerName: 'Skräp',
      status: 'SPAM',
    });

    const response = await supertest(harness.app.server)
      .get('/api/booking-requests?status=PENDING')
      .set('cookie', staff.cookies.join('; '))
      .expect(200);

    const body = bookingRequestListResponseSchema.parse(jsonBody(response));
    expect(body.data.map((row) => row.id)).toEqual([second, first]);
    // The badge counts everything still PENDING, not the filtered page — it
    // has to say "there is work" while the user is looking at something else.
    expect(body.unhandledCount).toBe(2);
  });

  it('never exposes the stored IP hash', async () => {
    await seedBookingRequest(harness);

    const response = await supertest(harness.app.server)
      .get('/api/booking-requests')
      .set('cookie', staff.cookies.join('; '))
      .expect(200);

    // A GDPR mitigation (§5.5) that the browser could read would be a
    // fingerprint instead.
    expect(response.text).not.toContain('sourceIpHash');
  });

  it('rejects a request with a reason and records who did it', async () => {
    const id = await seedBookingRequest(harness);

    const response = await withAgent(
      supertest(harness.app.server).post(`/api/booking-requests/${id}/reject`),
      staff,
    )
      .send({ reason: 'Vi har inga lediga tider den veckan.' })
      .expect(200);

    const body = bookingRequestSchema.parse(jsonBody(response));
    expect(body.status).toBe('REJECTED');
    expect(body.rejectionReason).toBe('Vi har inga lediga tider den veckan.');
    expect(body.handledByUserId).toBe(staff.userId);
    expect(body.handledAt).not.toBeNull();

    const entry = await harness.app.prisma.auditLog.findFirst({
      where: { action: 'booking_request.rejected', entityId: id },
    });
    expect(entry?.entityType).toBe('BookingRequest');
  });

  it('refuses to reject a request twice', async () => {
    const id = await seedBookingRequest(harness);
    const reject = (): supertest.Test =>
      withAgent(
        supertest(harness.app.server).post(
          `/api/booking-requests/${id}/reject`,
        ),
        staff,
      ).send({ reason: 'Dubbelbokat.' });

    await reject().expect(200);
    const response = await reject().expect(409);
    expect(apiErrorSchema.parse(jsonBody(response)).error.code).toBe(
      'CONFLICT',
    );
  });

  it('can still act on a request the heuristic flagged as spam', async () => {
    // The heuristic is allowed to be wrong, and a real customer whose message
    // happened to contain a link must not become unreachable.
    const id = await seedBookingRequest(harness, { status: 'SPAM' });

    await withAgent(
      supertest(harness.app.server).post(`/api/booking-requests/${id}/reject`),
      staff,
    )
      .send({ reason: 'Skräppost.' })
      .expect(200);
  });

  it('answers 404 for a request that does not exist', async () => {
    await withAgent(
      supertest(harness.app.server).post(
        '/api/booking-requests/00000000-0000-0000-0000-000000000000/reject',
      ),
      staff,
    )
      .send({ reason: 'Finns inte.' })
      .expect(404);
  });
});
