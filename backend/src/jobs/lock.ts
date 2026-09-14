import type { AnyDbClient, Database } from '../lib/prisma.js';

/**
 * Running a scheduled job under a Postgres advisory lock (PROJECT_SPEC.md
 * §8.4, B11.3.1, B11.5.1).
 *
 * `pg_try_advisory_xact_lock`, not the session-scoped `pg_advisory_lock` /
 * `pg_advisory_unlock` pair. A session lock has to be released on the exact
 * connection that took it, and a plain Prisma client draws each `$queryRaw`
 * from its pool with no guarantee of getting the same one back — which is
 * precisely the "pinned connection" B11.5.1 asks for. A **transaction-scoped**
 * lock sidesteps the problem instead of solving it: Prisma's interactive
 * `$transaction` reserves one connection for its whole duration, the lock is
 * taken and used on that same connection, and it is released automatically
 * when the transaction ends — on success, on a thrown error, or on a crash
 * that simply drops the connection. There is no separate unlock call to
 * forget, and nothing can leak the lock the way a crash between `lock()` and
 * `unlock()` would.
 */

export type JobLogger = {
  readonly info: (obj: Record<string, unknown>, msg: string) => void;
  readonly warn: (obj: Record<string, unknown>, msg: string) => void;
  readonly error: (obj: Record<string, unknown>, msg: string) => void;
};

export type ScheduledJob = {
  readonly name: string;
  /**
   * A stable key for `pg_try_advisory_xact_lock`, distinct per job. Postgres
   * advisory locks share one 64-bit keyspace across the whole database, so
   * two jobs must never reuse a key — each is hard-coded in
   * `jobs/scheduler.ts` rather than derived, which makes a collision a
   * one-line diff to catch in review instead of a hash nobody can eyeball.
   */
  readonly lockKey: bigint;
  readonly run: (db: AnyDbClient) => Promise<void>;
};

/**
 * `recommendation-refresh` and `retention` each loop over every vehicle or
 * customer inside this one transaction (composing the "InTransaction"
 * variants the way B5's booking confirmation composes
 * `createCustomerInTransaction`), so the whole sweep is atomic. Prisma's
 * interactive-transaction default is 5 seconds — sized for a request a user
 * is waiting on — which a fleet of thousands of vehicles would blow through
 * long before finishing (B13.1's seeded dataset is 8 000 of them). Nobody is
 * waiting on a 04:00 cron job, so it gets room instead: `maxWait` is how long
 * to queue for a free pool connection, `timeout` is how long the job itself
 * may run once it has one.
 */
const JOB_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 300_000 };

function readLocked(rows: unknown): boolean {
  const first: unknown = Array.isArray(rows) ? rows[0] : undefined;
  return (
    typeof first === 'object' &&
    first !== null &&
    'locked' in first &&
    first.locked === true
  );
}

/**
 * Runs one job, guarded by its advisory lock, and never lets it throw into
 * the caller (B11.3.6) — a failed job is a log line an operator reads
 * tomorrow, not a reason to bring down the process or cancel every other job
 * still scheduled today.
 */
export async function runScheduledJob(
  db: Database,
  logger: JobLogger,
  job: ScheduledJob,
): Promise<void> {
  const startedAt = Date.now();

  try {
    const acquired = await db.$transaction(async (tx) => {
      const rows: unknown = await tx.$queryRaw`
        SELECT pg_try_advisory_xact_lock(${job.lockKey}) AS "locked"
      `;
      if (!readLocked(rows)) {
        return false;
      }
      await job.run(tx);
      return true;
    }, JOB_TRANSACTION_OPTIONS);

    const durationMs = Date.now() - startedAt;
    logger.info(
      { job: job.name, durationMs, ran: acquired },
      acquired
        ? 'Scheduled job finished'
        : 'Scheduled job skipped — already running elsewhere',
    );
  } catch (error) {
    logger.error(
      { job: job.name, durationMs: Date.now() - startedAt, err: error },
      'Scheduled job failed',
    );
  }
}
