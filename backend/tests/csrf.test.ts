import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { apiErrorSchema, CSRF_COOKIE_NAME, CSRF_TOKEN_HEADER } from 'shared';
import { z } from 'zod';
import { createTestApp, type TestApp } from './helpers/app.js';
import { jsonBody } from './helpers/http.js';
import {
  bootstrapCsrf,
  cookieHeader,
  login,
  loginAs,
  readSetCookie,
  seedUser,
  TEST_PASSWORD,
  withAgent,
} from './helpers/auth.js';

/**
 * B2.5 — CSRF (PROJECT_SPEC.md §5.2).
 *
 * The token is an HMAC of the session id, not a free-floating random value:
 * matching a cookie against a header proves only that the two match, whereas
 * binding to the session also proves the token belongs to *this* session.
 */

function registerProbeRoutes(app: FastifyInstance): void {
  app.post(
    '/test/csrf/write',
    {
      config: { auth: 'authenticated' },
      schema: { response: { 200: z.object({ ok: z.literal(true) }) } },
    },
    () => ({ ok: true as const }),
  );

  app.get(
    '/test/csrf/read',
    {
      config: { auth: 'authenticated' },
      schema: { response: { 200: z.object({ ok: z.literal(true) }) } },
    },
    () => ({ ok: true as const }),
  );
}

describe('the double-submit token', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp({ register: registerProbeRoutes });
  });

  afterAll(async () => {
    await harness.close();
  });

  it('accepts an unsafe request carrying a valid token', async () => {
    const agent = await loginAs(harness);

    await withAgent(
      supertest(harness.app.server).post('/test/csrf/write'),
      agent,
    ).expect(200);
  });

  it('rejects an unsafe request with no token at all', async () => {
    const agent = await loginAs(harness);

    const response = await supertest(harness.app.server)
      .post('/test/csrf/write')
      .set('cookie', agent.cookies.join('; '))
      .expect(403);

    const body = apiErrorSchema.parse(jsonBody(response));
    expect(body.error.code).toBe('FORBIDDEN');
    // Swedish, and it says what to do next (§9.7).
    expect(body.error.message).toContain('Ladda om sidan');
  });

  it('rejects a token that does not match the cookie', async () => {
    const agent = await loginAs(harness);

    await supertest(harness.app.server)
      .post('/test/csrf/write')
      .set('cookie', agent.cookies.join('; '))
      .set(CSRF_TOKEN_HEADER, 'f'.repeat(64))
      .expect(403);
  });

  it("rejects another session's valid token", async () => {
    // The session-fixation variant §5.2 exists to close: the token is
    // structurally valid, it is simply not bound to this session.
    const mine = await loginAs(harness);
    const theirs = await loginAs(harness);

    expect(mine.csrfToken).not.toBe(theirs.csrfToken);

    await supertest(harness.app.server)
      .post('/test/csrf/write')
      .set('cookie', mine.cookies.join('; '))
      .set(CSRF_TOKEN_HEADER, theirs.csrfToken)
      .expect(403);
  });

  it('never asks a safe method for a token', async () => {
    const agent = await loginAs(harness);

    await supertest(harness.app.server)
      .get('/test/csrf/read')
      .set('cookie', agent.cookies.join('; '))
      .expect(200);
  });

  it('protects login rather than exempting it', async () => {
    // §5.2 forbids exempting by prefix. Login has no session yet, so the token
    // is bound to an anonymous binding cookie instead — but it is still
    // required, because login CSRF signs a victim into the attacker's account.
    const user = await seedUser(harness);

    await supertest(harness.app.server)
      .post('/api/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD })
      .expect(403);
  });

  it('issues a token to an anonymous visitor so login is reachable', async () => {
    const bootstrap = await bootstrapCsrf(harness);
    expect(bootstrap.token).toMatch(/^[0-9a-f]{64}$/);

    const user = await seedUser(harness);
    await supertest(harness.app.server)
      .post('/api/auth/login')
      .set('cookie', cookieHeader(bootstrap.jar))
      .set(CSRF_TOKEN_HEADER, bootstrap.token)
      .send({ email: user.email, password: TEST_PASSWORD })
      .expect(200);
  });

  it('reissues the cookie on login, because the session id is the binding', async () => {
    const bootstrap = await bootstrapCsrf(harness);
    const user = await seedUser(harness);

    const response = await supertest(harness.app.server)
      .post('/api/auth/login')
      .set('cookie', cookieHeader(bootstrap.jar))
      .set(CSRF_TOKEN_HEADER, bootstrap.token)
      .send({ email: user.email, password: TEST_PASSWORD })
      .expect(200);

    const reissued = readSetCookie(response.headers).find((cookie) =>
      cookie.startsWith(`${CSRF_COOKIE_NAME}=`),
    );

    expect(reissued).toBeDefined();
    // Forgetting this produces a user who is logged in and cannot save
    // anything, and the failure looks like a permissions bug (§5.2).
    expect(reissued).not.toContain(bootstrap.token);
  });
});

describe('a password change rotates the session and the token (B2.5.4)', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp({ register: registerProbeRoutes });
  });

  afterAll(async () => {
    await harness.close();
  });

  it('revokes other sessions and leaves the current one able to save', async () => {
    const user = await seedUser(harness, { password: 'first-password-2026' });

    // The same person signed in on two devices — the shared workshop tablet
    // and a laptop.
    const tablet = await login(harness, user.email, 'first-password-2026');
    const laptop = await login(harness, user.email, 'first-password-2026');

    const response = await withAgent(
      supertest(harness.app.server).post('/api/auth/password'),
      laptop,
    )
      .send({
        currentPassword: 'first-password-2026',
        newPassword: 'second-password-2026',
      })
      .expect(200);

    const body = z
      .object({ changed: z.literal(true), revokedSessions: z.number() })
      .parse(jsonBody(response));
    expect(body.revokedSessions).toBe(1);

    // The other device is signed out.
    await supertest(harness.app.server)
      .get('/api/auth/me')
      .set('cookie', tablet.cookies.join('; '))
      .expect(401);

    // And the one that made the change can still save, using the cookies the
    // response reissued — which is the whole point of B2.5.4.
    const rotated = new Map<string, string>();
    for (const cookie of readSetCookie(response.headers)) {
      const [pair] = cookie.split(';');
      const separator = pair?.indexOf('=') ?? -1;
      if (pair !== undefined && separator > 0) {
        rotated.set(pair.slice(0, separator), pair.slice(separator + 1));
      }
    }

    const newToken = rotated.get(CSRF_COOKIE_NAME);
    expect(newToken).toBeDefined();
    expect(newToken).not.toBe(laptop.csrfToken);

    await supertest(harness.app.server)
      .post('/test/csrf/write')
      .set('cookie', cookieHeader(rotated))
      .set(CSRF_TOKEN_HEADER, decodeURIComponent(newToken ?? ''))
      .expect(200);
  });

  it('refuses a change that does not know the current password', async () => {
    const user = await seedUser(harness, { password: 'known-password-2026' });
    const agent = await login(harness, user.email, 'known-password-2026');

    await withAgent(
      supertest(harness.app.server).post('/api/auth/password'),
      agent,
    )
      .send({
        currentPassword: 'guessed-password-2026',
        newPassword: 'attacker-password-2026',
      })
      .expect(401);
  });

  it('lets the new password sign in and refuses the old one', async () => {
    const user = await seedUser(harness, { password: 'old-password-2026' });
    const agent = await login(harness, user.email, 'old-password-2026');

    await withAgent(
      supertest(harness.app.server).post('/api/auth/password'),
      agent,
    )
      .send({
        currentPassword: 'old-password-2026',
        newPassword: 'new-password-2026',
      })
      .expect(200);

    await login(harness, user.email, 'new-password-2026');

    const bootstrap = await bootstrapCsrf(harness);
    await supertest(harness.app.server)
      .post('/api/auth/login')
      .set('cookie', cookieHeader(bootstrap.jar))
      .set(CSRF_TOKEN_HEADER, bootstrap.token)
      .send({ email: user.email, password: 'old-password-2026' })
      .expect(401);
  });
});
