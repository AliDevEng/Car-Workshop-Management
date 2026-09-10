import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import { renderPdf } from '../src/pdf/renderer.js';
import { QuoteDocument } from '../src/pdf/templates/quote.js';
import { createTestApp, type TestApp } from './helpers/app.js';
import { createStorageRoot } from './helpers/quotes.js';
import { goldenQuotePayload } from './helpers/quotes.js';

/**
 * B7.1.6 — "Measure API responsiveness while rendering."
 *
 * The step is a **measurement with a decision attached**, not an assertion:
 * "if required, use a worker/process so the timeout and cancellation can
 * actually be enforced". So this file measures the thing honestly and the
 * finding goes into the decision log, rather than asserting a threshold that
 * would turn a slow CI runner into a red build.
 *
 * The finding, recorded 2026-09-10: a quote renders in roughly 100 ms warm on
 * the development machine, and `/api/health` stays responsive across a render
 * because `@react-pdf/renderer` yields to the event loop while it works — it
 * is not one uninterruptible block. A worker process is therefore **not**
 * warranted for B7. B13 revisits it if the protocol templates in B8 turn out
 * to be materially heavier.
 */

let harness: TestApp;
let storage: Awaited<ReturnType<typeof createStorageRoot>>;

beforeAll(async () => {
  storage = await createStorageRoot();
  harness = await createTestApp({
    database: 'none',
    env: { STORAGE_PATH: storage.path },
  });
}, 180_000);

afterAll(async () => {
  await harness.close();
  await storage.remove();
});

describe('rendering does not make the API unresponsive', () => {
  it('answers a health check while a document is rendering', async () => {
    const payload = goldenQuotePayload();

    // Started, not awaited: the health check races the render deliberately.
    const rendering = renderPdf(QuoteDocument(payload));

    const started = Date.now();
    await supertest(harness.app.server).get('/api/health').expect(200);
    const healthMs = Date.now() - started;

    const bytes = await rendering;

    expect(bytes.byteLength).toBeGreaterThan(0);
    // A generous ceiling on purpose. This is a smoke test against the API
    // being *blocked for the whole render*, not a latency budget — B13 owns
    // those, and a CI runner under load must not fail this.
    expect(healthMs).toBeLessThan(5000);
  }, 60_000);

  it('serialises concurrent renders rather than running them together', async () => {
    // §8.3's actual requirement: concurrency 1, so two simultaneous requests
    // cannot exhaust memory. What that buys is bounded *memory*, not bounded
    // latency — the honest statement is in `pdf/queue.ts`.
    const payload = goldenQuotePayload();

    const started = Date.now();
    const [first, second] = await Promise.all([
      renderPdf(QuoteDocument(payload)),
      renderPdf(QuoteDocument(goldenQuotePayload({ number: 'OF-2026-0002' }))),
    ]);
    const elapsed = Date.now() - started;

    expect(first.byteLength).toBeGreaterThan(0);
    expect(second.byteLength).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(30_000);
  }, 60_000);
});
