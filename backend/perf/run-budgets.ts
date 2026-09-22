import { loadPerfConfig, type PerfConfig } from './config.js';
import { createRandom } from './dataset.js';
import {
  createClient,
  request,
  withAddress,
  type Client,
  type RequestSpec,
} from './driver.js';
import { loadFixtures } from './fixtures.js';
import { sampleMemory } from './memory.js';
import {
  exitCodeFor,
  formatBytes,
  printSummaryTable,
  printVerdicts,
} from './report.js';
import {
  BUDGETS_MS,
  MEMORY_BUDGET_BYTES,
  READ_SCENARIOS,
  PUBLIC_SCENARIOS,
  type BudgetName,
  type Fixtures,
  type Scenario,
} from './scenarios.js';
import { judge, summarise, type BudgetVerdict, type Sample } from './stats.js';

/**
 * B13.3 — the response-time and memory budgets.
 *
 *   PERF_FORWARDED_FOR=true pnpm --filter backend perf:budgets
 *
 * Measures each endpoint **unloaded and sequentially**, which is what a p95
 * budget for a two-person workshop is a statement about: the latency one
 * person sees while the other is also working. B13.4 is the separate question
 * of what happens under twenty concurrent users, and it has its own run.
 *
 * Exits non-zero when a budget fails, so this is usable as a gate rather than
 * as a report somebody has to read carefully.
 */

/** Per scenario. Above `MINIMUM_SAMPLES`, so a p95 is a real observation. */
const ITERATIONS = 30;
/** Discarded: the first call pays for the plan cache and the JIT. */
const WARMUP = 3;
/** How many PDFs B13.3.4's p95 is drawn from. Renders are seconds, not ms. */
const PDF_ITERATIONS = 20;

type Measured = {
  readonly name: string;
  readonly budget: BudgetName;
  readonly samples: readonly Sample[];
};

async function measure(
  client: Client,
  scenario: Scenario,
  fixtures: Fixtures,
  random: () => number,
): Promise<Measured> {
  const pick = <T>(values: readonly T[]): T => {
    const value = values[Math.floor(random() * values.length)];
    if (value === undefined) {
      throw new Error(
        `Scenario "${scenario.name}" has no fixture to pick from`,
      );
    }
    return value;
  };

  for (let index = 0; index < WARMUP; index += 1) {
    await request(client, scenario.build(fixtures, pick));
  }

  const samples: Sample[] = [];
  for (let index = 0; index < ITERATIONS; index += 1) {
    const result = await request(client, scenario.build(fixtures, pick));
    samples.push(result.sample);
  }

  return { name: scenario.name, budget: scenario.budget, samples };
}

/**
 * B13.3.4 — a real quote, sent, which is the only thing that renders a PDF.
 *
 * The send is the measured call: it spends a §4.4 number, renders through the
 * B7 queue and stores the file, all in one transaction. Creating the draft
 * first is setup and is deliberately outside the timing — a draft costs a few
 * inserts, and including them would flatter a budget that exists to catch a
 * slow renderer.
 */
async function measurePdf(
  client: Client,
  fixtures: Fixtures,
  random: () => number,
): Promise<Measured> {
  const samples: Sample[] = [];
  const candidates = [...fixtures.workOrderIds];

  for (
    let index = 0;
    index < PDF_ITERATIONS && candidates.length > 0;
    index += 1
  ) {
    // One work order per quote: a second quote on an order whose first is
    // already sent is a revision (§6.6), a different code path with a
    // different cost.
    const position = Math.floor(random() * candidates.length);
    const [workOrderId] = candidates.splice(position, 1);
    if (workOrderId === undefined) {
      break;
    }

    const create: RequestSpec = {
      method: 'POST',
      path: `/api/work-orders/${workOrderId}/quotes`,
      body: {},
    };
    const created = await request(client, create);
    if (created.sample.status !== 201) {
      // A work order with no lines cannot be quoted, and that is a legitimate
      // answer rather than a failure — try the next one.
      continue;
    }

    const quoteId = readQuoteId(created.body);
    const send: RequestSpec = {
      method: 'POST',
      path: `/api/quotes/${quoteId}/send`,
    };
    const sent = await request(client, send);
    samples.push(sent.sample);
  }

  return { name: 'POST /api/quotes/:id/send (PDF)', budget: 'pdf', samples };
}

/** The created quote's id, narrowed rather than asserted (CLAUDE.md). */
function readQuoteId(body: unknown): string {
  if (
    typeof body === 'object' &&
    body !== null &&
    'quote' in body &&
    typeof body.quote === 'object' &&
    body.quote !== null &&
    'id' in body.quote &&
    typeof body.quote.id === 'string'
  ) {
    return body.quote.id;
  }
  throw new Error(
    `Unexpected quote response: ${JSON.stringify(body).slice(0, 200)}`,
  );
}

/** The four budgets in report order — `none` is measured but not judged. */
const JUDGED_BUDGETS: readonly Exclude<BudgetName, 'none'>[] = [
  'search',
  'list',
  'workOrderDetail',
  'pdf',
];

type Judged = {
  readonly budget: Exclude<BudgetName, 'none'>;
  readonly verdict: BudgetVerdict;
};

/**
 * One verdict per budget, over every scenario that carries it. The budget name
 * is carried alongside rather than read back off the verdict, so that naming
 * the worst offender below needs no cast (CLAUDE.md).
 */
function judgeBudgets(measured: readonly Measured[]): Judged[] {
  return JUDGED_BUDGETS.map((budget) => ({
    budget,
    verdict: judge(
      budget,
      BUDGETS_MS[budget],
      measured
        .filter((row) => row.budget === budget)
        .flatMap((row) => row.samples),
    ),
  }));
}

/**
 * The worst offender per failing budget, named. A budget covering twenty-eight
 * list endpoints fails as one line, and "which list" is the only question
 * anyone asks next.
 */
function reportWorstInBudget(
  measured: readonly Measured[],
  budget: BudgetName,
): void {
  const rows = measured
    .filter((row) => row.budget === budget)
    .map((row) => ({ name: row.name, summary: summarise(row.samples) }))
    .sort((left, right) => right.summary.p95Ms - left.summary.p95Ms)
    .slice(0, 5);

  if (rows.length > 0) {
    console.log(`\nSlowest in "${budget}":`);
    printSummaryTable(rows);
  }
}

async function main(config: PerfConfig): Promise<number> {
  const random = createRandom(config.PERF_SEED);
  const staff = await createClient(config);
  const fixtures = await loadFixtures(staff, new Date());

  console.log(
    `Measuring ${String(READ_SCENARIOS.length + PUBLIC_SCENARIOS.length)} ` +
      `scenarios x ${String(ITERATIONS)} against ${config.PERF_BASE_URL}` +
      (config.PERF_FORWARDED_FOR
        ? ' (one forwarded address per scenario)'
        : ' (single source address — §5.4 limit applies)'),
  );

  const measured: Measured[] = [];
  const scenarios = [...READ_SCENARIOS, ...PUBLIC_SCENARIOS];

  for (const [index, scenario] of scenarios.entries()) {
    // Each scenario gets its own §5.4 bucket when spreading is on: thirty-five
    // scenarios of thirty requests is over a thousand calls, and the global
    // ceiling is three hundred a minute per address.
    const client = config.PERF_FORWARDED_FOR
      ? withAddress(
          staff,
          `10.13.${String(Math.floor(index / 250))}.${String((index % 250) + 1)}`,
        )
      : staff;
    measured.push(await measure(client, scenario, fixtures, random));
  }

  const pdfClient = config.PERF_FORWARDED_FOR
    ? withAddress(staff, '10.13.200.1')
    : staff;
  measured.push(await measurePdf(pdfClient, fixtures, random));

  printSummaryTable(
    measured.map((row) => ({
      name: row.name,
      summary: summarise(row.samples),
    })),
  );

  const judged = judgeBudgets(measured);
  const verdicts = judged.map((row) => row.verdict);
  printVerdicts(verdicts);

  for (const row of judged) {
    if (!row.verdict.passed) {
      reportWorstInBudget(measured, row.budget);
    }
  }

  // B13.3.5. Sampled after the run rather than during: "steady state" is the
  // resting size once the work is done, and a sample taken mid-render measures
  // a peak the next line of this iteration's report would misattribute.
  const memory = await sampleMemory(config);
  console.log('');
  if (memory === null) {
    console.log(
      'MEMORY  not sampled — set PERF_MEMORY_CONTAINER or PERF_MEMORY_PID',
    );
  } else {
    const within = memory.bytes <= MEMORY_BUDGET_BYTES;
    console.log(
      `${within ? 'PASS' : 'FAIL'}  memory                   ` +
        `${formatBytes(memory.bytes)} of ${formatBytes(MEMORY_BUDGET_BYTES)} ` +
        `(${memory.source})`,
    );
    if (!within) {
      return 1;
    }
  }

  return exitCodeFor(verdicts);
}

process.exitCode = await main(loadPerfConfig());
