import type { AnyDbClient } from '../lib/prisma.js';
import { expireOverdueQuotesInTransaction } from '../modules/quotes/service.js';
import type { JobLogger } from './lock.js';

/**
 * The quote-expiry sweep (PROJECT_SPEC.md §4.2's `EXPIRED` status, §8.4's job
 * table; B7.3.3).
 *
 * **Why this file exists at all.** B7 decided, and recorded in the decision
 * log, that a quote past its `validUntil` is expired by a *sweep* rather than
 * by a status derived on read — "so `expireOverdueQuotes` writes the status and
 * B11 schedules it (§8.4 owns the runner)". B11 then shipped four jobs, and
 * this was not one of them: the rule existed, was exported, and was tested
 * directly by `tests/quotes.test.ts`, but nothing in the running process ever
 * called it. A quote's `status` column therefore stayed `SENT` forever, which
 * is the exact disagreement the sweep was chosen to avoid — the work-order
 * screen's quote list filters on that column, so an offert three months past
 * its date still read as outstanding.
 *
 * Nothing about the rule changed; only the wiring it was always supposed to
 * have. It runs at 04:45, after the retention sweep, so the two nightly passes
 * over the same tables do not queue behind each other for a pool connection.
 */
export async function runQuoteExpirySweep(
  tx: AnyDbClient,
  logger: JobLogger,
  now: Date = new Date(),
): Promise<{ readonly expired: number }> {
  const result = await expireOverdueQuotesInTransaction(tx, now);

  logger.info(
    { job: 'quote-expiry', expired: result.expired },
    `Quote expiry marked ${String(result.expired)} sent quote(s) as expired`,
  );

  return result;
}
