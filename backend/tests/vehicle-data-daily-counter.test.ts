import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDailyCounter } from '../src/integrations/vehicle-data/daily-counter.js';
import { createTestApp, type TestApp } from './helpers/app.js';

/**
 * The two daily provider-spend ceilings (PROJECT_SPEC.md §6.1, §7.1,
 * B10.3.1), persisted rather than held in process memory (H1.13).
 *
 * Every test clears the table first: the counter is deliberately durable, so
 * without that one test's spending would be the next one's starting balance.
 */
describe('createDailyCounter (§6.1, §7.1, B10.3.1, H1.13)', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.app.prisma.vehicleDataCallCounter.deleteMany();
  });

  it('allows calls at or under the limit and refuses the 201st', async () => {
    const counter = createDailyCounter(harness.app.prisma);

    for (let i = 0; i < 200; i += 1) {
      expect(await counter.consume('staff', 200)).toBe(true);
    }
    expect(await counter.consume('staff', 200)).toBe(false);
  });

  it('keeps the public and staff buckets independent', async () => {
    const counter = createDailyCounter(harness.app.prisma);

    for (let i = 0; i < 3; i += 1) {
      await counter.consume('public', 3);
    }

    expect(await counter.consume('public', 3)).toBe(false);
    expect(await counter.consume('staff', 3)).toBe(true);
  });

  it('reads the limit fresh on every call, so a raised Setting applies immediately', async () => {
    const counter = createDailyCounter(harness.app.prisma);

    for (let i = 0; i < 10; i += 1) {
      await counter.consume('staff', 10);
    }
    expect(await counter.consume('staff', 10)).toBe(false);
    // The admin raises the ceiling in Settings — no restart needed.
    expect(await counter.consume('staff', 20)).toBe(true);
  });

  it('resets the window 24 hours after its first call, not at midnight', async () => {
    let now = new Date('2026-10-01T22:00:00.000Z');
    const counter = createDailyCounter(harness.app.prisma, () => now);

    for (let i = 0; i < 5; i += 1) {
      await counter.consume('staff', 5);
    }
    expect(await counter.consume('staff', 5)).toBe(false);

    // Past midnight in both UTC and Stockholm, but inside the window.
    now = new Date('2026-10-02T21:59:59.999Z');
    expect(await counter.consume('staff', 5)).toBe(false);

    now = new Date('2026-10-02T22:00:00.001Z');
    expect(await counter.consume('staff', 5)).toBe(true);
  });

  it('H1.13 — a restart does not refill a budget already spent', async () => {
    const beforeRestart = createDailyCounter(harness.app.prisma);
    for (let i = 0; i < 4; i += 1) {
      await beforeRestart.consume('public', 4);
    }

    // A new counter is what a restarted process builds; the only thing it
    // shares with the old one is the database.
    const afterRestart = createDailyCounter(harness.app.prisma);
    expect(await afterRestart.consume('public', 4)).toBe(false);
  });

  it('never lets concurrent calls spend past the ceiling', async () => {
    const counter = createDailyCounter(harness.app.prisma);

    // Separate statements on the pool, not one transaction client, so these
    // genuinely race in Postgres (CLAUDE.md's `Promise.all` trap is about a
    // single transaction connection, which this deliberately is not).
    const verdicts = await Promise.all(
      Array.from({ length: 30 }, () => counter.consume('public', 10)),
    );

    expect(verdicts.filter(Boolean)).toHaveLength(10);
    const row = await harness.app.prisma.vehicleDataCallCounter.findUniqueOrThrow(
      { where: { key: 'public' } },
    );
    expect(row.count).toBe(30);
  });
});
