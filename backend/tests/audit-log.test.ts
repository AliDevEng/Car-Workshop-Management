import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLogListResponseSchema } from 'shared';
import { createTestApp, type TestApp } from './helpers/app.js';
import { loginAs } from './helpers/auth.js';
import { get, post } from './helpers/work-orders.js';
import { jsonBody } from './helpers/http.js';

/**
 * `GET /api/audit-log` (PROJECT_SPEC.md §4.2, B11.1.4).
 *
 * The log itself is written and unit-tested where each mutation happens
 * (B2.7, `tests/audit.test.ts`); this file is only about the reader — who may
 * open it, and whether its filters and pagination answer the right rows.
 */

describe('GET /api/audit-log', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('is closed to an unauthenticated caller', async () => {
    await supertest(harness.app.server).get('/api/audit-log').expect(401);
  });

  it('is closed to a MECHANIC (§5.3 — the same class as user management)', async () => {
    const mechanic = await loginAs(harness, { role: 'MECHANIC' });
    await get(harness, mechanic, '/api/audit-log').expect(403);
  });

  it('lets an ADMIN read entries newest first, filtered by entity', async () => {
    const admin = await loginAs(harness, { role: 'ADMIN' });

    const created = jsonBody(
      await post(harness, admin, '/api/users', {
        email: `audit-target-${crypto.randomUUID()}@verkstaden.se`,
        name: 'Granskad Användare',
        role: 'MECHANIC',
        password: 'a-perfectly-fine-password',
      }).expect(201),
    );
    const targetId =
      typeof created === 'object' && created !== null && 'id' in created
        ? String(created.id)
        : '';

    const response = auditLogListResponseSchema.parse(
      jsonBody(
        await get(
          harness,
          admin,
          `/api/audit-log?entityType=User&entityId=${targetId}`,
        ).expect(200),
      ),
    );

    expect(response.data.length).toBeGreaterThan(0);
    expect(response.data.every((entry) => entry.entityType === 'User')).toBe(
      true,
    );
    expect(response.data.every((entry) => entry.entityId === targetId)).toBe(
      true,
    );
    expect(response.data[0]?.action).toBe('user.created');
    expect(response.data[0]?.user?.id).toBe(admin.userId);
  });

  it('paginates on a cursor, oldest page boundary excluded from the next', async () => {
    const admin = await loginAs(harness, { role: 'ADMIN' });

    // Three distinct mutations guarantee at least three fresh rows to page
    // over, on top of whatever earlier tests in this file already wrote.
    for (let i = 0; i < 3; i += 1) {
      await post(harness, admin, '/api/users', {
        email: `audit-page-${crypto.randomUUID()}@verkstaden.se`,
        name: 'Sidnumrerad Användare',
        role: 'MECHANIC',
        password: 'a-perfectly-fine-password',
      }).expect(201);
    }

    const firstPage = auditLogListResponseSchema.parse(
      jsonBody(await get(harness, admin, '/api/audit-log?limit=2').expect(200)),
    );
    expect(firstPage.data).toHaveLength(2);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = auditLogListResponseSchema.parse(
      jsonBody(
        await get(
          harness,
          admin,
          `/api/audit-log?limit=2&cursor=${firstPage.nextCursor ?? ''}`,
        ).expect(200),
      ),
    );

    const firstPageIds = new Set(firstPage.data.map((entry) => entry.id));
    for (const entry of secondPage.data) {
      expect(firstPageIds.has(entry.id)).toBe(false);
    }
  });

  it('never exposes a password or a hash through the reader (B2.7.2)', async () => {
    const admin = await loginAs(harness, { role: 'ADMIN' });

    await post(harness, admin, '/api/users', {
      email: `audit-secret-${crypto.randomUUID()}@verkstaden.se`,
      name: 'Hemlig Användare',
      role: 'MECHANIC',
      password: 'this-string-must-never-be-readable',
    }).expect(201);

    const response = await get(harness, admin, '/api/audit-log?limit=100')
      .expect(200);

    expect(response.text).not.toContain('this-string-must-never-be-readable');
    expect(response.text).not.toContain('passwordHash');
    expect(response.text).not.toContain('$argon2');
  });
});
