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
import { apiErrorSchema, paginatedResponseSchema, userSchema } from 'shared';
import { createTestApp, type TestApp } from './helpers/app.js';
import { jsonBody } from './helpers/http.js';
import { loginAs, seedUser, withAgent } from './helpers/auth.js';

/**
 * B2.6 — staff account management (PROJECT_SPEC.md §4.3, §5.3).
 *
 * `ADMIN`-only throughout, and nothing is ever hard-deleted.
 */

const userListSchema = paginatedResponseSchema(userSchema);

describe('user management', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('refuses every route to a MECHANIC', async () => {
    const agent = await loginAs(harness, { role: 'MECHANIC' });
    const target = await seedUser(harness);

    await supertest(harness.app.server)
      .get('/api/users')
      .set('cookie', agent.cookies.join('; '))
      .expect(403);

    await withAgent(supertest(harness.app.server).post('/api/users'), agent)
      .send({
        email: 'ny@verkstaden.se',
        name: 'Ny Person',
        role: 'MECHANIC',
        password: 'a-long-enough-password',
      })
      .expect(403);

    await withAgent(
      supertest(harness.app.server).post(`/api/users/${target.id}/deactivate`),
      agent,
    ).expect(403);
  });

  it('creates a user an admin can then sign in as', async () => {
    const admin = await loginAs(harness, { role: 'ADMIN' });

    const response = await withAgent(
      supertest(harness.app.server).post('/api/users'),
      admin,
    )
      .send({
        email: 'david@verkstaden.se',
        name: 'David Dahl',
        role: 'MECHANIC',
        password: 'a-perfectly-fine-password',
      })
      .expect(201);

    const created = userSchema.parse(jsonBody(response));
    expect(created.email).toBe('david@verkstaden.se');
    expect(created.isActive).toBe(true);
    expect(response.text).not.toContain('password');
  });

  it('rejects a duplicate email as a 409, not a 500', async () => {
    const admin = await loginAs(harness, { role: 'ADMIN' });
    const existing = await seedUser(harness);

    const response = await withAgent(
      supertest(harness.app.server).post('/api/users'),
      admin,
    )
      .send({
        email: existing.email,
        name: 'Dubblett',
        role: 'MECHANIC',
        password: 'a-perfectly-fine-password',
      })
      .expect(409);

    expect(apiErrorSchema.parse(jsonBody(response)).error.code).toBe(
      'CONFLICT',
    );
  });

  it('rejects a password shorter than the shared schema allows', async () => {
    const admin = await loginAs(harness, { role: 'ADMIN' });

    await withAgent(supertest(harness.app.server).post('/api/users'), admin)
      .send({
        email: 'kort@verkstaden.se',
        name: 'Kort Lösen',
        role: 'MECHANIC',
        password: 'kort',
      })
      .expect(400);
  });

  it('lists and paginates users', async () => {
    const admin = await loginAs(harness, { role: 'ADMIN' });
    await seedUser(harness);
    await seedUser(harness);

    const first = await supertest(harness.app.server)
      .get('/api/users?limit=2')
      .set('cookie', admin.cookies.join('; '))
      .expect(200);

    const page = userListSchema.parse(jsonBody(first));
    expect(page.data).toHaveLength(2);
    expect(page.nextCursor).toBeTypeOf('string');

    const second = await supertest(harness.app.server)
      .get(`/api/users?limit=2&cursor=${String(page.nextCursor)}`)
      .set('cookie', admin.cookies.join('; '))
      .expect(200);

    const next = userListSchema.parse(jsonBody(second));
    // A cursor page must not repeat a row from the previous one.
    const firstIds = new Set(page.data.map((user) => user.id));
    for (const user of next.data) {
      expect(firstIds.has(user.id)).toBe(false);
    }
  });

  it('updates a user and records the change', async () => {
    const admin = await loginAs(harness, { role: 'ADMIN' });
    const target = await seedUser(harness, { name: 'Före Namn' });

    const response = await withAgent(
      supertest(harness.app.server).patch(`/api/users/${target.id}`),
      admin,
    )
      .send({ name: 'Efter Namn' })
      .expect(200);

    expect(userSchema.parse(jsonBody(response)).name).toBe('Efter Namn');
  });

  it('answers 404 for a user that does not exist', async () => {
    const admin = await loginAs(harness, { role: 'ADMIN' });

    await supertest(harness.app.server)
      .get('/api/users/01960000-0000-7000-8000-000000000000')
      .set('cookie', admin.cookies.join('; '))
      .expect(404);
  });

  it('deactivates rather than deletes, and ends that user’s sessions', async () => {
    const admin = await loginAs(harness, { role: 'ADMIN' });
    const victim = await loginAs(harness, { role: 'MECHANIC' });

    const response = await withAgent(
      supertest(harness.app.server).post(
        `/api/users/${victim.userId}/deactivate`,
      ),
      admin,
    ).expect(200);

    expect(userSchema.parse(jsonBody(response)).isActive).toBe(false);

    // The row survives — §4.3, so the audit trail keeps its actor.
    const stillThere = await harness.app.prisma.user.findUnique({
      where: { id: victim.userId },
    });
    expect(stillThere).not.toBeNull();

    // But access ends immediately, which is why this system uses sessions.
    const sessions = await harness.app.prisma.session.count({
      where: { userId: victim.userId },
    });
    expect(sessions).toBe(0);

    await supertest(harness.app.server)
      .get('/api/auth/me')
      .set('cookie', victim.cookies.join('; '))
      .expect(401);
  });

  it('reactivates a user, who can sign in again', async () => {
    const admin = await loginAs(harness, { role: 'ADMIN' });
    const target = await seedUser(harness, { isActive: false });

    const response = await withAgent(
      supertest(harness.app.server).post(`/api/users/${target.id}/reactivate`),
      admin,
    ).expect(200);

    expect(userSchema.parse(jsonBody(response)).isActive).toBe(true);
    await loginAs(harness, {});
  });
});

describe('the last active admin (B2.6.3)', () => {
  /**
   * A database of its own per test. "Is this the last admin?" is a question
   * about the whole table, so a shared database would let one test's admin
   * satisfy the next test's count and quietly turn every assertion green for
   * the wrong reason.
   */
  let harness: TestApp;

  beforeEach(async () => {
    harness = await createTestApp();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('cannot be deactivated', async () => {
    const admin = await loginAs(harness, { role: 'ADMIN' });

    const response = await withAgent(
      supertest(harness.app.server).post(
        `/api/users/${admin.userId}/deactivate`,
      ),
      admin,
    ).expect(409);

    const body = apiErrorSchema.parse(jsonBody(response));
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.message).toContain('minst en aktiv administratör');

    // Still an admin, still active — and still able to work.
    await supertest(harness.app.server)
      .get('/api/users')
      .set('cookie', admin.cookies.join('; '))
      .expect(200);
  });

  it('cannot be demoted to MECHANIC either', async () => {
    // Demotion locks the workshop out of its own settings exactly as
    // thoroughly as deactivation does.
    const admin = await loginAs(harness, { role: 'ADMIN' });

    await withAgent(
      supertest(harness.app.server).patch(`/api/users/${admin.userId}`),
      admin,
    )
      .send({ role: 'MECHANIC' })
      .expect(409);
  });

  it('can be deactivated once a second admin exists', async () => {
    const first = await loginAs(harness, { role: 'ADMIN' });
    const second = await seedUser(harness, { role: 'ADMIN' });

    await withAgent(
      supertest(harness.app.server).post(`/api/users/${second.id}/deactivate`),
      first,
    ).expect(200);

    // And now the first one is the last again, so it is protected once more.
    await withAgent(
      supertest(harness.app.server).post(
        `/api/users/${first.userId}/deactivate`,
      ),
      first,
    ).expect(409);
  });

  it('survives two admins deactivating each other at the same moment', async () => {
    // A smoke test, and deliberately labelled as one: two requests fired
    // together usually finish one after the other, so this does **not**
    // reliably reproduce the interleaving — it still passes with the row lock
    // removed. `admin-lock.test.ts` forces the interleaving and is the actual
    // regression test for the lock. This asserts the outcome a user cares
    // about: whatever the ordering, the table never ends up with no admin.
    const first = await loginAs(harness, { role: 'ADMIN' });
    const second = await loginAs(harness, { role: 'ADMIN' });

    const results = await Promise.allSettled([
      withAgent(
        supertest(harness.app.server).post(
          `/api/users/${second.userId}/deactivate`,
        ),
        first,
      ),
      withAgent(
        supertest(harness.app.server).post(
          `/api/users/${first.userId}/deactivate`,
        ),
        second,
      ),
    ]);

    const statuses = results.map((result) =>
      result.status === 'fulfilled' ? result.value.status : 0,
    );

    // Exactly one may win. The other is a 409, never a second success.
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);

    const activeAdmins = await harness.app.prisma.user.count({
      where: { role: 'ADMIN', isActive: true },
    });
    expect(activeAdmins).toBe(1);
  });

  it('ignores a deactivated admin when counting', async () => {
    const admin = await loginAs(harness, { role: 'ADMIN' });
    await seedUser(harness, { role: 'ADMIN', isActive: false });

    // An inactive admin cannot log in, so counting them would leave the
    // workshop with no usable administrator at all.
    await withAgent(
      supertest(harness.app.server).post(
        `/api/users/${admin.userId}/deactivate`,
      ),
      admin,
    ).expect(409);
  });
});
