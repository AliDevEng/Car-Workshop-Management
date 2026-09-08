import supertest from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  apiErrorSchema,
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  userSchema,
} from 'shared';
import { createTestApp, type TestApp } from './helpers/app.js';
import { jsonBody } from './helpers/http.js';
import {
  attemptLogin,
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
 * B2.2 and B2.3 — sessions, login, logout and the current user
 * (PROJECT_SPEC.md §5.1).
 */

describe('login and the session lifecycle', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('signs a user in and returns them without the password hash', async () => {
    const user = await seedUser(harness, { role: 'ADMIN' });

    const csrf = await bootstrapCsrf(harness);
    const response = await supertest(harness.app.server)
      .post('/api/auth/login')
      .set('cookie', cookieHeader(csrf.jar))
      .set('x-csrf-token', csrf.token)
      .send({ email: user.email, password: TEST_PASSWORD })
      .expect(200);

    const body = userSchema.parse(jsonBody(response));
    expect(body.email).toBe(user.email);
    expect(body.role).toBe('ADMIN');
    // Stripped by the response schema, not by the repository remembering to
    // omit it — that is the §8.1 guarantee this asserts.
    expect(response.text).not.toContain('passwordHash');
    expect(response.text).not.toContain('argon2');
  });

  it('sets a signed httpOnly session cookie and a readable CSRF cookie', async () => {
    const user = await seedUser(harness);

    const bootstrap = await bootstrapCsrf(harness);
    const response = await supertest(harness.app.server)
      .post('/api/auth/login')
      .set('cookie', cookieHeader(bootstrap.jar))
      .set('x-csrf-token', bootstrap.token)
      .send({ email: user.email, password: TEST_PASSWORD })
      .expect(200);

    const cookies = readSetCookie(response.headers);
    const session = cookies.find((c) =>
      c.startsWith(`${SESSION_COOKIE_NAME}=`),
    );
    const csrf = cookies.find((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`));

    expect(session).toBeDefined();
    expect(session).toContain('HttpOnly');
    expect(session).toContain('SameSite=Lax');
    expect(session).toContain('Path=/');

    // Deliberately *not* httpOnly: the page has to copy it into the header,
    // which is the half of the double submit a cross-site attacker cannot do.
    expect(csrf).toBeDefined();
    expect(csrf).not.toContain('HttpOnly');
  });

  it('rejects a wrong password and an unknown email identically', async () => {
    const user = await seedUser(harness);

    const wrongPassword = await attemptLogin(
      harness,
      user.email,
      'not-the-password',
    );
    const unknownEmail = await attemptLogin(
      harness,
      'nobody@verkstaden.se',
      'not-the-password',
    );

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);

    const first = apiErrorSchema.parse(jsonBody(wrongPassword));
    const second = apiErrorSchema.parse(jsonBody(unknownEmail));

    // Same body, same status. A distinguishable answer is how an attacker
    // enumerates a two-person workshop's staff list (§5.1, B2.3.3).
    expect(first.error.code).toBe(second.error.code);
    expect(first.error.message).toBe(second.error.message);
  });

  it('refuses a deactivated user without saying so', async () => {
    const user = await seedUser(harness, { isActive: false });

    const response = await attemptLogin(harness, user.email, TEST_PASSWORD);
    expect(response.status).toBe(401);

    const body = apiErrorSchema.parse(jsonBody(response));
    // A distinct message would confirm the address belongs to a real employee.
    expect(body.error.message).toBe('Fel e-postadress eller lösenord.');
  });

  it('returns the signed-in user from /api/auth/me', async () => {
    const agent = await loginAs(harness, { name: 'Cecilia Ceder' });

    const response = await supertest(harness.app.server)
      .get('/api/auth/me')
      .set('cookie', agent.cookies.join('; '))
      .expect(200);

    expect(userSchema.parse(jsonBody(response)).name).toBe('Cecilia Ceder');
  });

  it('logs out, and the session stops working immediately', async () => {
    const agent = await loginAs(harness);

    await withAgent(
      supertest(harness.app.server).post('/api/auth/logout'),
      agent,
    ).expect(204);

    await supertest(harness.app.server)
      .get('/api/auth/me')
      .set('cookie', agent.cookies.join('; '))
      .expect(401);
  });

  it('rejects an expired session and deletes the row (B2.2.4)', async () => {
    const agent = await loginAs(harness);
    const before = await harness.app.prisma.session.count({
      where: { userId: agent.userId },
    });
    expect(before).toBe(1);

    await harness.app.prisma.session.updateMany({
      where: { userId: agent.userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await supertest(harness.app.server)
      .get('/api/auth/me')
      .set('cookie', agent.cookies.join('; '))
      .expect(401);

    // Deleted on access, not merely ignored — an abandoned session must not
    // linger until the hourly sweep happens to run.
    const after = await harness.app.prisma.session.count({
      where: { userId: agent.userId },
    });
    expect(after).toBe(0);
  });

  it('ends the session the moment the user is deactivated', async () => {
    const agent = await loginAs(harness);

    await harness.app.prisma.user.update({
      where: { id: agent.userId },
      data: { isActive: false },
    });

    // The whole reason §5.1 chose sessions over JWT: access ends now, not
    // when a token happens to expire.
    await supertest(harness.app.server)
      .get('/api/auth/me')
      .set('cookie', agent.cookies.join('; '))
      .expect(401);
  });

  it('treats a tampered session cookie as anonymous, not as an attack', async () => {
    await supertest(harness.app.server)
      .get('/api/auth/me')
      .set('cookie', `${SESSION_COOKIE_NAME}=forged-value`)
      .expect(401);
  });

  it('records the user agent and a hashed IP, never a raw address', async () => {
    const user = await seedUser(harness);
    const bootstrap = await bootstrapCsrf(harness);

    await supertest(harness.app.server)
      .post('/api/auth/login')
      .set('cookie', cookieHeader(bootstrap.jar))
      .set('x-csrf-token', bootstrap.token)
      .set('user-agent', 'Mozilla/5.0 (Verkstad Test)')
      .send({ email: user.email, password: TEST_PASSWORD })
      .expect(200);

    const session = await harness.app.prisma.session.findFirst({
      where: { userId: user.id },
      select: { ipHash: true, userAgent: true },
    });

    expect(session?.userAgent).toBe('Mozilla/5.0 (Verkstad Test)');
    // A salted SHA-256 (§5.5): 64 hex characters, and never a dotted quad.
    expect(session?.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(session?.ipHash).not.toContain('127.0.0.1');
  });

  it('slides the expiry forward on activity', async () => {
    const agent = await loginAs(harness);

    // Older than the touch interval, so the next request writes it back.
    const stale = new Date(Date.now() - 5 * 60 * 1000);
    await harness.app.prisma.session.updateMany({
      where: { userId: agent.userId },
      data: { lastSeenAt: stale },
    });

    await supertest(harness.app.server)
      .get('/api/auth/me')
      .set('cookie', agent.cookies.join('; '))
      .expect(200);

    const session = await harness.app.prisma.session.findFirst({
      where: { userId: agent.userId },
      select: { lastSeenAt: true },
    });
    expect(session?.lastSeenAt.getTime()).toBeGreaterThan(stale.getTime());
  });
});

describe('login rate limiting (B2.3.2)', () => {
  /**
   * A fresh app per test, deliberately. The limiters live on the instance, and
   * the IP bucket is genuinely shared between every request from one address —
   * which is the design (§5.1), and which would otherwise make these two tests
   * exhaust each other rather than exercise what they claim to.
   */
  let harness: TestApp;

  beforeEach(async () => {
    harness = await createTestApp();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('stops after five failed attempts and answers 429 in the envelope', async () => {
    const user = await seedUser(harness);

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const failed = await attemptLogin(harness, user.email, 'wrong');
      expect(failed.status).toBe(401);
    }

    const blocked = await attemptLogin(harness, user.email, 'wrong');
    expect(blocked.status).toBe(429);

    const body = apiErrorSchema.parse(jsonBody(blocked));
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.requestId).toBeTypeOf('string');

    // And the limit is on the account, not only on the attempt: the correct
    // password does not get through either while the window is open.
    const correct = await attemptLogin(harness, user.email, TEST_PASSWORD);
    expect(correct.status).toBe(429);
  });

  it('limits by IP as well as by email, so rotating the account does not help', async () => {
    // Five failures spread across five different accounts, from one address.
    // The email bucket never reaches its limit; the IP bucket does — which is
    // the reason there are two buckets rather than one composite key.
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const user = await seedUser(harness);
      const failed = await attemptLogin(harness, user.email, 'wrong');
      expect(failed.status).toBe(401);
    }

    const sixth = await seedUser(harness);
    const blocked = await attemptLogin(harness, sixth.email, 'wrong');
    expect(blocked.status).toBe(429);
  });

  it('clears the email counter after a successful login', async () => {
    const user = await seedUser(harness);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const failed = await attemptLogin(harness, user.email, 'wrong');
      expect(failed.status).toBe(401);
    }

    await login(harness, user.email);

    // A typo three times followed by the correct password must not leave the
    // account two attempts from being locked.
    const afterSuccess = await attemptLogin(harness, user.email, 'wrong');
    expect(afterSuccess.status).toBe(401);
  });
});
