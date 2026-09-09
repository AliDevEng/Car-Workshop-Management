import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  apiErrorSchema,
  workOrderDetailSchema,
  workOrderResponseSchema,
} from 'shared';
import { createTestApp, type TestApp } from './helpers/app.js';
import { loginAs, type Agent } from './helpers/auth.js';
import { jsonBody } from './helpers/http.js';
import {
  get,
  labourLine,
  patch,
  post,
  seedSubject,
  type SeededSubject,
} from './helpers/work-orders.js';
import { updateWithVersion } from '../src/modules/work-orders/service.js';

/**
 * B6.4 — optimistic locking (PROJECT_SPEC.md §6.5).
 *
 * "With two people and one shared tablet, silent last-write-wins would
 * eventually delete someone's work." What `version` covers is stated in §6.5
 * and is deliberately narrow: **header fields and status transitions only.**
 * Line operations are separate rows and are not version-checked, because two
 * mechanics adding different lines to the same job is normal, correct
 * behaviour — version-checking them produces constant false conflicts, which
 * trains people to click through the warning, and then the real conflict is
 * ignored too.
 */

describe('optimistic locking on work orders', () => {
  let harness: TestApp;
  let agent: Agent;
  let subject: SeededSubject;

  beforeAll(async () => {
    harness = await createTestApp();
    agent = await loginAs(harness, { role: 'ADMIN' });
    subject = await seedSubject(harness);
  });

  afterAll(async () => {
    await harness.close();
  });

  async function newOrder(): Promise<{ id: string; version: number }> {
    const response = await post(harness, agent, '/api/work-orders', {
      vehicleId: subject.vehicleId,
      customerId: subject.customerId,
      description: 'Stor service',
    }).expect(201);
    const body = workOrderResponseSchema.parse(jsonBody(response));
    return { id: body.workOrder.id, version: body.workOrder.version };
  }

  it('refuses a stale header edit and reports the current state (B6.4.2)', async () => {
    const order = await newOrder();

    // Two people opened the same order. The first saves.
    await patch(harness, agent, `/api/work-orders/${order.id}`, {
      description: 'Anna skrev detta',
      version: order.version,
    }).expect(200);

    // The second still holds the version they read.
    const response = await patch(
      harness,
      agent,
      `/api/work-orders/${order.id}`,
      {
        description: 'Björn skrev detta',
        version: order.version,
      },
    ).expect(409);

    const body = apiErrorSchema.parse(jsonBody(response));
    expect(body.error.code).toBe('CONFLICT');
    // The current version comes back, so the UI can offer to reload rather
    // than only saying "no".
    expect(JSON.stringify(body.error.details)).toContain('"version":1');

    const detail = jsonBody(
      await get(harness, agent, `/api/work-orders/${order.id}`),
    );
    expect(JSON.stringify(detail)).toContain('Anna skrev detta');
  });

  it('lets two mechanics add different lines without conflicting (B6.4.4)', async () => {
    const order = await newOrder();

    const [first, second] = await Promise.all([
      post(
        harness,
        agent,
        `/api/work-orders/${order.id}/lines`,
        labourLine({ description: 'Oljebyte' }),
      ),
      post(
        harness,
        agent,
        `/api/work-orders/${order.id}/lines`,
        labourLine({ description: 'Bromsbyte' }),
      ),
    ]);

    expect([first.status, second.status]).toEqual([201, 201]);

    const detail = workOrderDetailSchema.parse(
      jsonBody(await get(harness, agent, `/api/work-orders/${order.id}`)),
    );

    expect(detail.lines.map((line) => line.description).sort()).toEqual([
      'Bromsbyte',
      'Oljebyte',
    ]);
    // Both writes bumped it, so a header edit holding version 0 is still
    // caught — which is the half of §6.5 that is easy to drop.
    expect(detail.version).toBe(2);
  });

  it('catches a header edit that was stale because someone added a line', async () => {
    const order = await newOrder();

    await post(
      harness,
      agent,
      `/api/work-orders/${order.id}/lines`,
      labourLine(),
    ).expect(201);

    await patch(harness, agent, `/api/work-orders/${order.id}`, {
      description: 'Stale',
      version: order.version,
    }).expect(409);
  });

  /**
   * The compare-and-swap under real concurrency — and an **outcome check**,
   * not a regression test. The distinction is B2's, and it is recorded here
   * because it was measured rather than assumed.
   *
   * `updateWithVersion` was deliberately rewritten as a read-then-write and
   * this test still passed, at two contenders and at twenty. Prisma's
   * interactive transactions do overlap here (measured separately), but the
   * gap between a read and the write that follows it never opened wide enough
   * for a second reader to slip in: the loser blocks on the row lock and only
   * then issues its update. So no test at this layer distinguishes the two
   * implementations, and claiming one did would be worse than saying so.
   *
   * What guards the invariant is therefore the shape of the statement — the
   * version lives in the `where`, so PostgreSQL decides — plus the stale-edit
   * outcome above. This test pins the outcome that must hold either way.
   */
  it('lets exactly one of twenty concurrent writes at one version win (B6.4.3)', async () => {
    const order = await newOrder();
    const { prisma } = harness.app;
    const attempts = 20;

    const results = await Promise.allSettled(
      Array.from({ length: attempts }, (_unused, index) =>
        prisma.$transaction((tx) =>
          updateWithVersion(tx, order.id, order.version, {
            description: `Transaktion ${String(index)}`,
          }),
        ),
      ),
    );

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);
    expect(results).toHaveLength(attempts);

    const stored = await prisma.workOrder.findUniqueOrThrow({
      where: { id: order.id },
      select: { version: true },
    });
    // Exactly one increment: nineteen callers were told to reload, and none
    // of them silently overwrote the twentieth.
    expect(stored.version).toBe(1);
  });
});
