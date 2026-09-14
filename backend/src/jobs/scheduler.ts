import cron, { type ScheduledTask } from 'node-cron';
import { WORKSHOP_TIMEZONE } from 'shared';
import type { Database } from '../lib/prisma.js';
import { runScheduledJob, type JobLogger, type ScheduledJob } from './lock.js';
import { reconcileStockLedger } from './stock-reconciliation.js';
import { refreshServiceRecommendations } from './recommendation-refresh.js';
import { runRetentionSweep } from './retention.js';
import { runHourlyCleanup } from './session-cleanup.js';

/**
 * Wiring the §8.4 job table to `node-cron` (B11.3.1, B11.3.8).
 *
 * Deliberately called from `server.ts`, never from `app.ts` — the same
 * separation B0.5.1 draws between building the app and starting the process,
 * so that every test building an app through `createTestApp` gets a process
 * with no cron running in the background. B11.3.7's own requirement — "each
 * job is a plain exported function, unit-tested directly without cron" — is
 * what makes that safe: nothing under test depends on the scheduler existing.
 *
 * Each entry carries **two** independent overlap guards: `noOverlap: true` is
 * node-cron 4's own in-process guard (a job that somehow outran its own
 * schedule cannot start a second, overlapping run on this instance), and the
 * Postgres advisory lock in `runScheduledJob` is what actually matters — the
 * guard against a second *process* (a redeploy that briefly runs two
 * containers, say) running the same job at once. Belt and braces, at
 * negligible cost.
 *
 * `timezone: WORKSHOP_TIMEZONE` is what makes "03:00 daily" mean 03:00 in
 * Stockholm rather than in the container's UTC clock across a DST change —
 * the same reasoning `shared/time.ts` already applies to booking boundaries
 * (§3.6, B5).
 */

/**
 * Distinct per job, and hard-coded rather than derived from the name: a hash
 * collision between two job names would silently let one job's lock guard
 * the other, and a literal here is a one-line diff to check in review.
 */
const LOCK_KEYS = {
  stockReconciliation: 8_110_001n,
  recommendationRefresh: 8_110_002n,
  retention: 8_110_003n,
  hourlyCleanup: 8_110_004n,
} as const;

export type CronSchedules = {
  readonly stockReconciliation: string;
  readonly recommendationRefresh: string;
  readonly retention: string;
  readonly hourlyCleanup: string;
};

/** §8.4's table, as cron expressions in the workshop's own local time. */
export const DEFAULT_SCHEDULES: CronSchedules = {
  stockReconciliation: '0 3 * * *',
  recommendationRefresh: '0 4 * * *',
  retention: '30 4 * * *',
  hourlyCleanup: '0 * * * *',
};

function jobsFor(logger: JobLogger): readonly ScheduledJob[] {
  return [
    {
      name: 'stock-reconciliation',
      lockKey: LOCK_KEYS.stockReconciliation,
      run: (db) => reconcileStockLedger(db, logger).then(() => undefined),
    },
    {
      name: 'recommendation-refresh',
      lockKey: LOCK_KEYS.recommendationRefresh,
      run: (db) =>
        refreshServiceRecommendations(db, logger).then(() => undefined),
    },
    {
      name: 'retention',
      lockKey: LOCK_KEYS.retention,
      run: (db) => runRetentionSweep(db, logger).then(() => undefined),
    },
    {
      name: 'hourly-cleanup',
      lockKey: LOCK_KEYS.hourlyCleanup,
      run: (db) => runHourlyCleanup(db, logger).then(() => undefined),
    },
  ];
}

export function startScheduledJobs(
  db: Database,
  logger: JobLogger,
  schedules: CronSchedules = DEFAULT_SCHEDULES,
): readonly ScheduledTask[] {
  const jobs = jobsFor(logger);
  const scheduleByName: Record<string, string> = {
    'stock-reconciliation': schedules.stockReconciliation,
    'recommendation-refresh': schedules.recommendationRefresh,
    retention: schedules.retention,
    'hourly-cleanup': schedules.hourlyCleanup,
  };

  return jobs.map((job) => {
    const expression = scheduleByName[job.name];
    if (expression === undefined) {
      throw new Error(`No cron schedule configured for job "${job.name}"`);
    }

    return cron.schedule(
      expression,
      () => {
        void runScheduledJob(db, logger, job);
      },
      { name: job.name, timezone: WORKSHOP_TIMEZONE, noOverlap: true },
    );
  });
}
