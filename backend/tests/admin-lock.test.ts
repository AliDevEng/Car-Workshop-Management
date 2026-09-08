import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './helpers/app.js';
import { seedUser } from './helpers/auth.js';

/**
 * B2.6.3 — the row lock behind "the last active admin cannot be deactivated".
 *
 * The HTTP-level concurrency test in `users.test.ts` is a smoke test: two
 * requests fired together usually finish one after the other, so it does not
 * reliably reproduce the interleaving it describes. **It passes with the lock
 * removed**, which was worth discovering.
 *
 * This file tests the mechanism instead, with the interleaving forced. Without
 * `SELECT ... FOR UPDATE`, both transactions read "there is another admin",
 * both proceed, and the workshop is locked out of its own settings with no
 * route left to fix it — the check-then-act race CLAUDE.md's trap table names.
 */

/** A promise plus its resolver, so a transaction can be held open on demand. */
function deferred(): { promise: Promise<void>; release: () => void } {
  let release = (): void => {
    throw new Error('deferred released before it was initialised');
  };
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

const LOCK_ACTIVE_ADMINS = `SELECT id FROM "User" WHERE "role" = 'ADMIN'::"UserRole" AND "isActive" = true FOR UPDATE`;

describe('the active-admin row lock', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('makes a second transaction wait, then read the committed state', async () => {
    const first = await seedUser(harness, { role: 'ADMIN' });
    const second = await seedUser(harness, { role: 'ADMIN' });

    const held = deferred();
    const lockTaken = deferred();

    // A: takes the lock, deactivates one admin, and holds the transaction open.
    const transactionA = harness.app.prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(LOCK_ACTIVE_ADMINS);
        await tx.user.update({
          where: { id: second.id },
          data: { isActive: false },
        });
        lockTaken.release();
        await held.promise;
      },
      { timeout: 20_000 },
    );

    await lockTaken.promise;

    // B: asks the same question A is in the middle of changing the answer to.
    const transactionB = harness.app.prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(LOCK_ACTIVE_ADMINS);
        return tx.user.count({
          where: { role: 'ADMIN', isActive: true, NOT: { id: first.id } },
        });
      },
      { timeout: 20_000 },
    );

    // Nothing B does can complete while A holds the lock, so releasing A here
    // is what lets B proceed — and B then re-evaluates against A's committed
    // rows rather than the snapshot it would have read a moment earlier.
    held.release();
    await transactionA;

    const remainingAdmins = await transactionB;

    // Zero, which is what makes `assertNotLastActiveAdmin` refuse. Without the
    // lock B would have counted `second` as still active and allowed the
    // deactivation that empties the table.
    expect(remainingAdmins).toBe(0);

    const activeAdmins = await harness.app.prisma.user.count({
      where: { role: 'ADMIN', isActive: true },
    });
    expect(activeAdmins).toBe(1);
  });
});
