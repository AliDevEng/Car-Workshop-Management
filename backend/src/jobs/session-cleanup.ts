import type { AnyDbClient } from '../lib/prisma.js';
import type { JobLogger } from './lock.js';

/**
 * The hourly cleanup (PROJECT_SPEC.md §4.2, §8.4, B11.3.5, B11.5.3).
 *
 * Two unrelated tables, one schedule, because both are "delete rows this
 * system will never read again" and neither needs its own advisory lock slot.
 */

const IDEMPOTENCY_KEY_RETENTION_HOURS = 24;

/** Expired `Session` rows (§5.1's 30-day sliding expiry has already passed). */
export async function cleanupExpiredSessions(
  db: AnyDbClient,
  now: Date = new Date(),
): Promise<number> {
  const result = await db.session.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  return result.count;
}

/**
 * `IdempotencyKey` rows older than 24 hours (§4.2). A replay window this wide
 * covers any realistic retry — a tablet left overnight included — without
 * keeping the table growing forever.
 */
export async function cleanupExpiredIdempotencyKeys(
  db: AnyDbClient,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(
    now.getTime() - IDEMPOTENCY_KEY_RETENTION_HOURS * 60 * 60 * 1000,
  );
  const result = await db.idempotencyKey.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}

export async function runHourlyCleanup(
  db: AnyDbClient,
  logger: JobLogger,
  now: Date = new Date(),
): Promise<{
  readonly sessionsDeleted: number;
  readonly idempotencyKeysDeleted: number;
}> {
  const sessionsDeleted = await cleanupExpiredSessions(db, now);
  const idempotencyKeysDeleted = await cleanupExpiredIdempotencyKeys(db, now);

  logger.info(
    { job: 'hourly-cleanup', sessionsDeleted, idempotencyKeysDeleted },
    `Hourly cleanup removed ${String(sessionsDeleted)} expired session(s) ` +
      `and ${String(idempotencyKeysDeleted)} expired idempotency key(s)`,
  );

  return { sessionsDeleted, idempotencyKeysDeleted };
}
