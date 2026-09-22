import { performance } from 'node:perf_hooks';
import { loadPerfConfig, type PerfConfig } from './config.js';
import { createRandom } from './dataset.js';
import { createClient, request, type Client } from './driver.js';
import { loadFixtures } from './fixtures.js';
import {
  LOAD_TEST_PASSWORD,
  loadTestEmail,
  loadTestRole,
} from './load-users.js';
import { trackPeakMemory } from './memory.js';
import { formatBytes, printSummaryTable } from './report.js';
import {
  chooseScenario,
  MEMORY_BUDGET_BYTES,
  scenariosForRole,
  type Fixtures,
} from './scenarios.js';
import { isErrorStatus, summarise, type Sample } from './stats.js';

/**
 * B13.4 — twenty concurrent users for five minutes, zero errors.
 *
 *   PERF_FORWARDED_FOR=true pnpm --filter backend perf:load
 *
 * Each virtual user is a real logged-in session with its own cookie jar, doing
 * what a staff member does: a weighted walk over the mix in `scenarios.ts`,
 * with a short pause between requests. The pause is not padding — twenty users
 * hammering with zero think time is a different test (how fast can the box go)
 * from the one B13.4.2 asks for (does the system stay correct and responsive
 * while twenty people use it).
 */

const VIRTUAL_USERS = 20;
const DURATION_MS = 5 * 60 * 1_000;
/** A staff member reads the screen between clicks. */
const THINK_TIME_MS = { min: 250, max: 1_250 } as const;
/** Progress every this often, so a five-minute run is not a blank terminal. */
const PROGRESS_INTERVAL_MS = 30_000;

type Recorded = Sample & { readonly scenario: string };

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One virtual user, until the deadline.
 *
 * Errors are recorded, never thrown: a run that aborted on the first `429`
 * would report nothing about the other nineteen users, and the error count is
 * the measurement B13.4.2 is actually about.
 */
async function virtualUser(
  client: Client,
  role: 'ADMIN' | 'MECHANIC',
  fixtures: Fixtures,
  random: () => number,
  deadline: number,
  sink: Recorded[],
): Promise<void> {
  const pick = <T>(values: readonly T[]): T => {
    const value = values[Math.floor(random() * values.length)];
    if (value === undefined) {
      throw new Error('A scenario has no fixture to pick from');
    }
    return value;
  };

  // Only what this user's role may call (§5.3) — a `MECHANIC` drawing
  // `GET /api/users` would score a correct `403` as a failure.
  const scenarios = scenariosForRole(role);

  while (performance.now() < deadline) {
    const scenario = chooseScenario(scenarios, random());
    const result = await request(client, scenario.build(fixtures, pick));
    sink.push({ ...result.sample, scenario: scenario.name });

    await sleep(
      THINK_TIME_MS.min +
        Math.floor(random() * (THINK_TIME_MS.max - THINK_TIME_MS.min)),
    );
  }
}

function reportErrors(samples: readonly Recorded[]): void {
  const failures = samples.filter((sample) => isErrorStatus(sample.status));
  if (failures.length === 0) {
    console.log('\nPASS  zero errors across the run (B13.4.2)');
    return;
  }

  const byStatus = new Map<string, number>();
  for (const failure of failures) {
    const key = `${String(failure.status)} ${failure.scenario}`;
    byStatus.set(key, (byStatus.get(key) ?? 0) + 1);
  }

  console.log(
    `\nFAIL  ${String(failures.length)} of ${String(samples.length)} requests failed (B13.4.2)`,
  );
  for (const [key, count] of [...byStatus].sort((a, b) => b[1] - a[1])) {
    console.log(`        ${String(count).padStart(6)}  ${key}`);
  }
}

async function main(config: PerfConfig): Promise<number> {
  const fixtureClient = await createClient(config);
  const fixtures = await loadFixtures(fixtureClient, new Date());

  console.log(
    `${String(VIRTUAL_USERS)} virtual users for ${String(DURATION_MS / 1000)} s ` +
      `against ${config.PERF_BASE_URL}` +
      (config.PERF_FORWARDED_FOR
        ? ' (one forwarded address per user)'
        : ' (single source address — §5.4 limit applies)'),
  );

  // One account per virtual user, seeded by `perf/seed.ts` — `load-users.ts`
  // explains why this cannot be one shared account or one shared session.
  const clients = await Promise.all(
    Array.from({ length: VIRTUAL_USERS }, (_, index) =>
      createClient(
        {
          ...config,
          PERF_EMAIL: loadTestEmail(index),
          PERF_PASSWORD: LOAD_TEST_PASSWORD,
        },
        config.PERF_FORWARDED_FOR ? `10.20.0.${String(index + 1)}` : undefined,
      ),
    ),
  );

  const samples: Recorded[] = [];
  const startedAt = performance.now();
  const deadline = startedAt + DURATION_MS;
  let running = true;

  const progress = setInterval(() => {
    const elapsed = Math.round((performance.now() - startedAt) / 1000);
    const errors = samples.filter((sample) =>
      isErrorStatus(sample.status),
    ).length;
    console.log(
      `  ${String(elapsed)} s — ${String(samples.length)} requests, ` +
        `${String(errors)} errors`,
    );
  }, PROGRESS_INTERVAL_MS);

  const memory = trackPeakMemory(config, () => running);

  await Promise.all(
    clients.map((client, index) =>
      // One PRNG per user, seeded from the run's seed: the mix is reproducible
      // without every user walking the identical sequence.
      virtualUser(
        client,
        loadTestRole(index),
        fixtures,
        createRandom(config.PERF_SEED + index),
        deadline,
        samples,
      ),
    ),
  );

  running = false;
  clearInterval(progress);

  const elapsedSeconds = (performance.now() - startedAt) / 1000;
  const byScenario = new Map<string, Sample[]>();
  for (const sample of samples) {
    const bucket = byScenario.get(sample.scenario);
    if (bucket === undefined) {
      byScenario.set(sample.scenario, [sample]);
    } else {
      bucket.push(sample);
    }
  }

  console.log('');
  printSummaryTable(
    [...byScenario]
      .map(([name, scenarioSamples]) => ({
        name,
        summary: summarise(scenarioSamples),
      }))
      .sort((left, right) => right.summary.p95Ms - left.summary.p95Ms),
  );

  console.log(
    `\nOverall: ${String(samples.length)} requests in ` +
      `${elapsedSeconds.toFixed(1)} s ` +
      `(${(samples.length / elapsedSeconds).toFixed(1)}/s), ` +
      `p95 ${summarise(samples).p95Ms.toFixed(1)} ms`,
  );

  reportErrors(samples);

  const peak = await memory;
  if (peak === null) {
    console.log(
      'MEMORY  not sampled — set PERF_MEMORY_CONTAINER or PERF_MEMORY_PID',
    );
  } else {
    const within = peak.bytes <= MEMORY_BUDGET_BYTES;
    console.log(
      `${within ? 'PASS' : 'FAIL'}  peak memory under load ` +
        `${formatBytes(peak.bytes)} of ${formatBytes(MEMORY_BUDGET_BYTES)} ` +
        `(${peak.source})`,
    );
    if (!within) {
      return 1;
    }
  }

  return samples.some((sample) => isErrorStatus(sample.status)) ? 1 : 0;
}

process.exitCode = await main(loadPerfConfig());
