import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './helpers/app.js';
import { login, loginAs, seedUser, withAgent } from './helpers/auth.js';
import { writeAuditLog } from '../src/lib/audit.js';

/**
 * B2.7 — the audit foundation (PROJECT_SPEC.md §4.2).
 *
 * The log lands in B2 rather than B11 so audited mutations in B4 onward are
 * written and tested as they are built. B11 later verifies coverage across
 * every domain module and exposes the reader.
 */

describe('user-management mutations are audited', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('records a creation with its actor and the new values', async () => {
    const admin = await loginAs(harness, { role: 'ADMIN' });

    const response = await withAgent(
      supertest(harness.app.server).post('/api/users'),
      admin,
    )
      .send({
        email: 'erik@verkstaden.se',
        name: 'Erik Ek',
        role: 'MECHANIC',
        password: 'a-perfectly-fine-password',
      })
      .expect(201);

    const created: unknown = JSON.parse(response.text);
    const createdId =
      typeof created === 'object' && created !== null && 'id' in created
        ? String(created.id)
        : '';

    const entry = await harness.app.prisma.auditLog.findFirst({
      where: { action: 'user.created', entityId: createdId },
    });

    expect(entry).not.toBeNull();
    expect(entry?.userId).toBe(admin.userId);
    expect(entry?.entityType).toBe('User');
    expect(entry?.afterJson).toMatchObject({
      email: 'erik@verkstaden.se',
      role: 'MECHANIC',
      isActive: true,
    });
    // Salted hash, never the address (§5.5).
    expect(entry?.ipHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('never writes a password or a hash into the log (B2.7.2)', async () => {
    const admin = await loginAs(harness, { role: 'ADMIN' });

    await withAgent(supertest(harness.app.server).post('/api/users'), admin)
      .send({
        email: 'frida@verkstaden.se',
        name: 'Frida Falk',
        role: 'MECHANIC',
        password: 'this-string-must-never-be-stored',
      })
      .expect(201);

    const entries = await harness.app.prisma.auditLog.findMany();
    const serialised = JSON.stringify(entries);

    expect(serialised).not.toContain('this-string-must-never-be-stored');
    expect(serialised).not.toContain('passwordHash');
    expect(serialised).not.toContain('$argon2');
  });

  it('records both sides of an update', async () => {
    const admin = await loginAs(harness, { role: 'ADMIN' });
    const target = await seedUser(harness, { name: 'Gamla Namnet' });

    await withAgent(
      supertest(harness.app.server).patch(`/api/users/${target.id}`),
      admin,
    )
      .send({ name: 'Nya Namnet' })
      .expect(200);

    const entry = await harness.app.prisma.auditLog.findFirst({
      where: { action: 'user.updated', entityId: target.id },
    });

    expect(entry?.beforeJson).toMatchObject({ name: 'Gamla Namnet' });
    expect(entry?.afterJson).toMatchObject({ name: 'Nya Namnet' });
  });

  it('records a deactivation', async () => {
    const admin = await loginAs(harness, { role: 'ADMIN' });
    const target = await seedUser(harness);

    await withAgent(
      supertest(harness.app.server).post(`/api/users/${target.id}/deactivate`),
      admin,
    ).expect(200);

    const entry = await harness.app.prisma.auditLog.findFirst({
      where: { action: 'user.deactivated', entityId: target.id },
    });

    expect(entry?.beforeJson).toMatchObject({ isActive: true });
    expect(entry?.afterJson).toMatchObject({ isActive: false });
  });

  it('records a password change without recording the password', async () => {
    const user = await seedUser(harness, { password: 'before-password-2026' });
    const agent = await login(harness, user.email, 'before-password-2026');

    await withAgent(
      supertest(harness.app.server).post('/api/auth/password'),
      agent,
    )
      .send({
        currentPassword: 'before-password-2026',
        newPassword: 'after-password-2026',
      })
      .expect(200);

    const entry = await harness.app.prisma.auditLog.findFirst({
      where: { action: 'user.password_changed', entityId: user.id },
    });

    expect(entry).not.toBeNull();
    expect(entry?.userId).toBe(user.id);
    // No before/after at all: the only field that changed is the one that must
    // never be recorded. The action and the actor are the audit value.
    expect(entry?.beforeJson).toBeNull();
    expect(entry?.afterJson).toBeNull();
    expect(JSON.stringify(entry)).not.toContain('after-password-2026');
  });

  it('rolls back with the transaction it is written in (§8.2)', async () => {
    // The guarantee is that the log and the change share a transaction: a log
    // written afterwards is a log a crash can lose, leaving a change nobody
    // can account for. Asserted directly, because no route can reach the
    // in-between state — every service writes the entry last, on purpose.
    const target = await seedUser(harness);
    const before = await harness.app.prisma.auditLog.count();

    await expect(
      harness.app.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: target.id },
          data: { name: 'Ändrat men aldrig sparat' },
        });
        await writeAuditLog(tx, {
          userId: target.id,
          action: 'user.updated',
          entityType: 'User',
          entityId: target.id,
          after: { name: 'Ändrat men aldrig sparat' },
        });
        throw new Error('something failed after both writes');
      }),
    ).rejects.toThrow('something failed after both writes');

    expect(await harness.app.prisma.auditLog.count()).toBe(before);
    const unchanged = await harness.app.prisma.user.findUnique({
      where: { id: target.id },
      select: { name: true },
    });
    expect(unchanged?.name).not.toBe('Ändrat men aldrig sparat');
  });
});
