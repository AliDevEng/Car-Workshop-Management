import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiErrorSchema, CSRF_TOKEN_HEADER } from 'shared';
import { createTestApp, type TestApp } from './helpers/app.js';
import {
  bootstrapCsrf,
  cookieHeader,
  loginAs,
  type Agent,
} from './helpers/auth.js';
import { jsonBody } from './helpers/http.js';
import { get, post } from './helpers/work-orders.js';

/**
 * B11.4 — verifying the §5.4 baseline that was not already exercised.
 *
 * Helmet, the global rate limit and the CSRF allow-list already have their
 * own tests in `security.test.ts`; the per-route limiters on the two public
 * endpoints (booking requests, vehicle lookup) already have theirs in
 * `booking-requests.test.ts` and `vehicle-data.test.ts` — B11.4.2 asks that
 * both layers exist, and by that point in the plan they already did. What is
 * new here is the 1 MB body cap (B11.4.3) and a direct sweep for
 * `passwordHash` across every response the user module can produce (B11.4.5).
 */

describe('the 1 MB body cap (§5.4, B11.4.3)', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp({ database: 'none' });
  });

  afterAll(async () => {
    await harness.close();
  });

  it('answers 413 in the §3.7 envelope for a body over the limit', async () => {
    const bootstrap = await bootstrapCsrf(harness);
    const oversized = 'a'.repeat(1_048_577);

    // Fastify sees `Content-Length` exceed the cap before reading any body
    // bytes and answers 413 immediately, without waiting for the client to
    // finish sending — so under load (the full suite running many
    // Postgres-backed files in parallel) the socket can be reset while
    // supertest is still writing the 1 MB request, and Node surfaces that as
    // `ECONNRESET` on the client rather than a completed response. Both
    // outcomes are the cap doing its job; only the graceful one gets the
    // envelope assertion, because the reset case has no response to read.
    try {
      const response = await supertest(harness.app.server)
        .post('/api/public/booking-requests')
        .set('cookie', cookieHeader(bootstrap.jar))
        .set(CSRF_TOKEN_HEADER, bootstrap.token)
        .send({ message: oversized });

      expect(response.status).toBe(413);
      const body = apiErrorSchema.parse(jsonBody(response));
      expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
      expect(body.error.requestId).toBeTypeOf('string');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('ECONNRESET')) {
        throw error;
      }
    }
  });

  it('accepts a body comfortably under the limit', async () => {
    const bootstrap = await bootstrapCsrf(harness);

    const response = await supertest(harness.app.server)
      .post('/api/public/booking-requests')
      .set(
        'cookie',
        cookieHeader(bootstrap.jar),
      )
      .set(CSRF_TOKEN_HEADER, bootstrap.token)
      .send({});

    // An empty body fails *validation*, not the size cap — proving the limit
    // itself did not also reject a normal request.
    expect(response.status).toBe(400);
  });
});

describe('passwordHash never reaches a response (§5.4, B11.4.5)', () => {
  let harness: TestApp;
  let admin: Agent;

  beforeAll(async () => {
    harness = await createTestApp();
    admin = await loginAs(harness, { role: 'ADMIN' });
  });

  afterAll(async () => {
    await harness.close();
  });

  it('is absent from the user list, a single user and a fresh creation', async () => {
    const created = await post(harness, admin, '/api/users', {
      email: `hash-sweep-${crypto.randomUUID()}@verkstaden.se`,
      name: 'Svept Användare',
      role: 'MECHANIC',
      password: 'a-perfectly-fine-password-2026',
    }).expect(201);
    expect(created.text).not.toContain('passwordHash');
    expect(created.text).not.toContain('$argon2');

    const created_ = jsonBody(created);
    const id =
      typeof created_ === 'object' && created_ !== null && 'id' in created_
        ? String(created_.id)
        : '';

    const list = await get(harness, admin, '/api/users').expect(200);
    expect(list.text).not.toContain('passwordHash');
    expect(list.text).not.toContain('$argon2');

    const detail = await get(harness, admin, `/api/users/${id}`).expect(200);
    expect(detail.text).not.toContain('passwordHash');
    expect(detail.text).not.toContain('$argon2');
  });

  it('is absent from a successful login response', async () => {
    const created = await post(harness, admin, '/api/users', {
      email: `hash-sweep-login-${crypto.randomUUID()}@verkstaden.se`,
      name: 'Inloggad Användare',
      role: 'MECHANIC',
      password: 'this-password-must-not-leak-2026',
    }).expect(201);
    const body = jsonBody(created);
    const email =
      typeof body === 'object' && body !== null && 'email' in body
        ? String(body.email)
        : '';

    const bootstrap = await bootstrapCsrf(harness);
    const response = await supertest(harness.app.server)
      .post('/api/auth/login')
      .set(
        'cookie',
        cookieHeader(bootstrap.jar),
      )
      .set(CSRF_TOKEN_HEADER, bootstrap.token)
      .send({ email, password: 'this-password-must-not-leak-2026' })
      .expect(200);

    expect(response.text).not.toContain('passwordHash');
    expect(response.text).not.toContain('$argon2');
    expect(response.text).not.toContain('this-password-must-not-leak-2026');
  });
});
