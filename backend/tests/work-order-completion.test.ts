import { Decimal } from 'decimal.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import {
  IDEMPOTENCY_KEY_HEADER,
  apiErrorSchema,
  workOrderResponseSchema,
} from 'shared';
import { createTestApp, type TestApp } from './helpers/app.js';
import { loginAs, withAgent, type Agent } from './helpers/auth.js';
import { jsonBody } from './helpers/http.js';
import {
  labourLine,
  partLine,
  post,
  seedArticle,
  seedSubject,
  type SeededSubject,
} from './helpers/work-orders.js';

/**
 * B6.5, B6.6 — status transitions, stock deduction and idempotency
 * (PROJECT_SPEC.md §6.4, §6.5, §8.1).
 *
 * The iteration's Definition of Done lives here: *"a work order can be
 * created, filled with lines, completed with stock deduction, and cannot be
 * double-completed even when the request is retried."*
 */

describe('completing a work order', () => {
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

  type Order = { id: string; version: number };

  async function newOrder(
    overrides: Record<string, unknown> = {},
  ): Promise<Order> {
    const response = await post(harness, agent, '/api/work-orders', {
      vehicleId: subject.vehicleId,
      customerId: subject.customerId,
      description: 'Stor service',
      ...overrides,
    }).expect(201);
    const body = workOrderResponseSchema.parse(jsonBody(response));
    return { id: body.workOrder.id, version: body.workOrder.version };
  }

  async function addLine(
    orderId: string,
    body: Record<string, unknown>,
  ): Promise<number> {
    const response = await post(
      harness,
      agent,
      `/api/work-orders/${orderId}/lines`,
      body,
    ).expect(201);
    return workOrderResponseSchema.parse(jsonBody(response)).workOrder.version;
  }

  function changeStatus(
    orderId: string,
    body: Record<string, unknown>,
    idempotencyKey?: string,
  ): supertest.Test {
    const request = withAgent(
      supertest(harness.app.server).post(`/api/work-orders/${orderId}/status`),
      agent,
    );
    return (
      idempotencyKey === undefined
        ? request
        : request.set(IDEMPOTENCY_KEY_HEADER, idempotencyKey)
    ).send(body);
  }

  async function stockOf(articleId: string): Promise<string> {
    const article = await harness.app.prisma.article.findUniqueOrThrow({
      where: { id: articleId },
      select: { stockQuantity: true },
    });
    return article.stockQuantity.toFixed();
  }

  /** The ledger is the truth; the cached column must always equal its sum. */
  async function ledgerSum(articleId: string): Promise<string> {
    const rows = await harness.app.prisma.stockMovement.findMany({
      where: { articleId },
      select: { quantity: true },
    });
    return rows
      .reduce((sum, row) => sum.plus(row.quantity.toFixed()), new Decimal(0))
      .toFixed();
  }

  /** A `DRAFT` → `IN_PROGRESS` order with one part line, ready to complete. */
  async function readyOrder(articleId: string): Promise<Order> {
    const order = await newOrder({ odometerKmIn: 120_000 });
    const version = await addLine(order.id, partLine(articleId));

    const response = await changeStatus(order.id, {
      status: 'IN_PROGRESS',
      version,
    }).expect(200);

    return {
      id: order.id,
      version: workOrderResponseSchema.parse(jsonBody(response)).workOrder
        .version,
    };
  }

  describe('the state machine (B6.5.1)', () => {
    it('refuses an illegal transition and says what is allowed instead', async () => {
      const order = await newOrder();

      // A draft has been through none of what completion requires (§6.5), so
      // the jump is refused by the table in `shared/`, not by a guard here.
      const response = await changeStatus(order.id, {
        status: 'COMPLETED',
        version: order.version,
      }).expect(409);

      const body = apiErrorSchema.parse(jsonBody(response));
      expect(body.error.code).toBe('CONFLICT');
      expect(JSON.stringify(body.error.details)).toContain('IN_PROGRESS');
    });

    it('refuses a transition to the same status', async () => {
      const order = await newOrder();
      await changeStatus(order.id, {
        status: 'DRAFT',
        version: order.version,
      }).expect(409);
    });

    it('assigns AO-YYYY-NNNN the first time the order leaves DRAFT (§4.4)', async () => {
      const first = await newOrder();
      const second = await newOrder();

      const a = workOrderResponseSchema.parse(
        jsonBody(
          await changeStatus(first.id, {
            status: 'IN_PROGRESS',
            version: first.version,
          }).expect(200),
        ),
      ).workOrder;
      const b = workOrderResponseSchema.parse(
        jsonBody(
          await changeStatus(second.id, {
            status: 'IN_PROGRESS',
            version: second.version,
          }).expect(200),
        ),
      ).workOrder;

      const year = new Date().getUTCFullYear();
      expect(a.number).toMatch(new RegExp(`^AO-${String(year)}-\\d{4}$`));
      expect(b.number).not.toBe(a.number);

      // Never reassigned: a later transition keeps the number it already has.
      const later = workOrderResponseSchema.parse(
        jsonBody(
          await changeStatus(first.id, {
            status: 'AWAITING_PARTS',
            version: a.version,
          }).expect(200),
        ),
      ).workOrder;
      expect(later.number).toBe(a.number);
    });

    it('numbers a cancelled draft too, because it is a record from then on', async () => {
      // §4.3 lets a `DRAFT` be removed outright and nothing else — so the
      // moment an order leaves `DRAFT` it is permanent, cancellation
      // included, and a permanent record the workshop may have to point at
      // needs a number to point at it by.
      const order = await newOrder();

      const cancelled = workOrderResponseSchema.parse(
        jsonBody(
          await changeStatus(order.id, {
            status: 'CANCELLED',
            version: order.version,
          }).expect(200),
        ),
      ).workOrder;

      expect(cancelled.number).toMatch(/^AO-\d{4}-\d{4}$/);
      // And `CANCELLED` is terminal (§4.3, B1.4): nothing further happens.
      await changeStatus(order.id, {
        status: 'IN_PROGRESS',
        version: cancelled.version,
      }).expect(409);
    });
  });

  describe('the completion preconditions (B6.5.2)', () => {
    it('refuses an order with no lines', async () => {
      const order = await newOrder({ odometerKmIn: 120_000 });
      const started = workOrderResponseSchema.parse(
        jsonBody(
          await changeStatus(order.id, {
            status: 'IN_PROGRESS',
            version: order.version,
          }).expect(200),
        ),
      ).workOrder;

      const response = await changeStatus(order.id, {
        status: 'COMPLETED',
        version: started.version,
        odometerKmOut: 121_000,
      }).expect(409);

      expect(apiErrorSchema.parse(jsonBody(response)).error.message).toContain(
        'minst en rad',
      );
    });

    it('refuses an order with no out-odometer, naming the field', async () => {
      const articleId = await seedArticle(harness, agent.userId);
      const order = await readyOrder(articleId);

      const response = await changeStatus(order.id, {
        status: 'COMPLETED',
        version: order.version,
      }).expect(400);

      expect(JSON.stringify(jsonBody(response))).toContain('odometerKmOut');
    });
  });

  describe('stock deduction (B6.6.1, B6.6.5)', () => {
    it('deducts once, records who and when, and leaves the ledger consistent', async () => {
      const articleId = await seedArticle(harness, agent.userId, {
        openingStock: '10',
      });
      const order = await readyOrder(articleId);

      const response = await changeStatus(order.id, {
        status: 'COMPLETED',
        version: order.version,
        odometerKmOut: 121_000,
      }).expect(200);

      const body = workOrderResponseSchema.parse(jsonBody(response));
      expect(body.workOrder.status).toBe('COMPLETED');
      expect(body.workOrder.completedAt).not.toBeNull();
      expect(body.workOrder.completedByUserId).toBe(agent.userId);
      expect(body.workOrder.lines.every((line) => line.stockDeducted)).toBe(
        true,
      );

      // 10 − 4 = 6, and the cache equals the ledger sum (§4.2).
      expect(await stockOf(articleId)).toBe('6');
      expect(await ledgerSum(articleId)).toBe('6');

      const movement = await harness.app.prisma.stockMovement.findFirstOrThrow({
        where: { workOrderId: order.id },
        select: { type: true, quantity: true, userId: true },
      });
      expect(movement.type).toBe('CONSUMPTION');
      expect(movement.quantity.toFixed()).toBe('-4');
      expect(movement.userId).toBe(agent.userId);
    });

    it('warns rather than blocking when the balance goes negative (§6.4)', async () => {
      // Blocking a mechanic from finishing a job because the count is wrong
      // is worse than an inaccurate count.
      const articleId = await seedArticle(harness, agent.userId, {
        openingStock: '1',
      });
      const order = await readyOrder(articleId);

      const response = await changeStatus(order.id, {
        status: 'COMPLETED',
        version: order.version,
        odometerKmOut: 121_000,
      }).expect(200);

      const body = workOrderResponseSchema.parse(jsonBody(response));
      expect(body.warnings.some((text) => text.includes('under noll'))).toBe(
        true,
      );
      expect(await stockOf(articleId)).toBe('-3');
    });

    it('moves nothing for a line with no article', async () => {
      const order = await newOrder({ odometerKmIn: 120_000 });
      const version = await addLine(
        order.id,
        // Labour, and a free-text part from the loose box: the inventory
        // never knew about either, so inventing a movement would put a
        // balance in the ledger that no purchase ever created.
        labourLine(),
      );
      const withPart = await addLine(order.id, {
        type: 'PART',
        description: 'Tätning ur lådan',
        quantity: '1',
        unit: 'PIECE',
        unitPriceOre: 2500,
        vatRateBps: 2500,
      });
      expect(withPart).toBe(version + 1);

      const started = workOrderResponseSchema.parse(
        jsonBody(
          await changeStatus(order.id, {
            status: 'IN_PROGRESS',
            version: withPart,
          }).expect(200),
        ),
      ).workOrder;

      await changeStatus(order.id, {
        status: 'COMPLETED',
        version: started.version,
        odometerKmOut: 121_000,
      }).expect(200);

      const movements = await harness.app.prisma.stockMovement.count({
        where: { workOrderId: order.id },
      });
      expect(movements).toBe(0);
    });

    it('writes the WORK_ORDER_OUT reading on completion (B6.7.1)', async () => {
      const articleId = await seedArticle(harness, agent.userId);
      const order = await readyOrder(articleId);

      await changeStatus(order.id, {
        status: 'COMPLETED',
        version: order.version,
        odometerKmOut: 125_000,
      }).expect(200);

      const readings = await harness.app.prisma.odometerReading.findMany({
        where: { workOrderId: order.id },
        select: { km: true, source: true },
        orderBy: { source: 'asc' },
      });
      expect(readings).toEqual([
        { km: 120_000, source: 'WORK_ORDER_IN' },
        { km: 125_000, source: 'WORK_ORDER_OUT' },
      ]);
    });
  });

  describe('idempotency (B6.6.2, B6.6.3)', () => {
    it('replays the stored response instead of deducting twice', async () => {
      const articleId = await seedArticle(harness, agent.userId, {
        openingStock: '10',
      });
      const order = await readyOrder(articleId);
      const key = `retry-${crypto.randomUUID()}`;
      const body = {
        status: 'COMPLETED',
        version: order.version,
        odometerKmOut: 121_000,
      };

      const first = await changeStatus(order.id, body, key).expect(200);
      // The tablet's retry: the same key, the same body. Without the stored
      // response this would be a 409 from the version check at best, and a
      // second deduction at worst.
      const replay = await changeStatus(order.id, body, key).expect(200);

      expect(jsonBody(replay)).toEqual(jsonBody(first));
      expect(await stockOf(articleId)).toBe('6');
      expect(await ledgerSum(articleId)).toBe('6');
    });

    it('refuses the same key with a different request (§4.2)', async () => {
      const articleId = await seedArticle(harness, agent.userId);
      const order = await readyOrder(articleId);
      const key = `reused-${crypto.randomUUID()}`;

      await changeStatus(
        order.id,
        { status: 'COMPLETED', version: order.version, odometerKmOut: 121_000 },
        key,
      ).expect(200);

      // A matching key with a different body means a bug, not a retry —
      // answering with the first result would hide it behind a response that
      // looks right.
      const response = await changeStatus(
        order.id,
        { status: 'IN_PROGRESS', version: order.version + 1 },
        key,
      ).expect(409);

      expect(apiErrorSchema.parse(jsonBody(response)).error.message).toContain(
        'Idempotency-Key',
      );
    });

    it('stores the key inside the same transaction as the effect (B6.6.3)', async () => {
      const articleId = await seedArticle(harness, agent.userId);
      const order = await readyOrder(articleId);
      const key = `atomic-${crypto.randomUUID()}`;

      // A completion that fails takes its claim down with it, so the retry is
      // free to do the work for real. If the row survived a failed mutation,
      // the genuine completion would be replayed as that failure for ever.
      await changeStatus(
        order.id,
        {
          status: 'COMPLETED',
          version: order.version + 99,
          odometerKmOut: 121_000,
        },
        key,
      ).expect(409);

      expect(
        await harness.app.prisma.idempotencyKey.count({ where: { key } }),
      ).toBe(0);

      // And the same key now works, because nothing happened under it.
      await changeStatus(
        order.id,
        { status: 'COMPLETED', version: order.version, odometerKmOut: 121_000 },
        key,
      ).expect(200);
    });

    it('deducts once when the same request arrives twice at once', async () => {
      const articleId = await seedArticle(harness, agent.userId, {
        openingStock: '10',
      });
      const order = await readyOrder(articleId);
      const key = `concurrent-${crypto.randomUUID()}`;
      const body = {
        status: 'COMPLETED',
        version: order.version,
        odometerKmOut: 121_000,
      };

      const [a, b] = await Promise.all([
        changeStatus(order.id, body, key),
        changeStatus(order.id, body, key),
      ]);

      // Both callers get an answer; only one effect happened.
      expect([a.status, b.status].filter((code) => code === 200)).toHaveLength(
        2,
      );
      expect(await stockOf(articleId)).toBe('6');
      expect(await ledgerSum(articleId)).toBe('6');
      expect(
        await harness.app.prisma.stockMovement.count({
          where: { workOrderId: order.id, type: 'CONSUMPTION' },
        }),
      ).toBe(1);
    });
  });

  describe('reverting a completed order (B6.6.4)', () => {
    it('writes compensating RETURN movements rather than deleting anything', async () => {
      const articleId = await seedArticle(harness, agent.userId, {
        openingStock: '10',
      });
      const order = await readyOrder(articleId);

      const completed = workOrderResponseSchema.parse(
        jsonBody(
          await changeStatus(order.id, {
            status: 'COMPLETED',
            version: order.version,
            odometerKmOut: 121_000,
          }).expect(200),
        ),
      ).workOrder;

      const reverted = workOrderResponseSchema.parse(
        jsonBody(
          await changeStatus(order.id, {
            status: 'IN_PROGRESS',
            version: completed.version,
          }).expect(200),
        ),
      ).workOrder;

      expect(reverted.status).toBe('IN_PROGRESS');
      expect(reverted.completedAt).toBeNull();
      expect(reverted.completedByUserId).toBeNull();
      expect(reverted.lines.every((line) => !line.stockDeducted)).toBe(true);

      // A reversal is its own audited event: "when did these parts go back on
      // the shelf, and who put them there" has to be findable.
      const audit = await harness.app.prisma.auditLog.findMany({
        where: { entityId: order.id },
        select: { action: true },
        orderBy: { at: 'asc' },
      });
      expect(audit.map((row) => row.action)).toContain('work_order.reverted');

      // The ledger is append-only: the part went out and came back, and that
      // is two rows, not one deleted one.
      const movements = await harness.app.prisma.stockMovement.findMany({
        where: { workOrderId: order.id },
        select: { type: true, quantity: true },
        orderBy: { id: 'asc' },
      });
      expect(movements.map((row) => row.type)).toEqual([
        'CONSUMPTION',
        'RETURN',
      ]);
      expect(await stockOf(articleId)).toBe('10');
      expect(await ledgerSum(articleId)).toBe('10');
    });

    it('deducts again when the order is completed a second time', async () => {
      const articleId = await seedArticle(harness, agent.userId, {
        openingStock: '10',
      });
      const order = await readyOrder(articleId);

      let version = order.version;
      for (const step of ['COMPLETED', 'IN_PROGRESS', 'COMPLETED'] as const) {
        const response = await changeStatus(order.id, {
          status: step,
          version,
          ...(step === 'COMPLETED' ? { odometerKmOut: 121_000 } : {}),
        }).expect(200);
        version = workOrderResponseSchema.parse(jsonBody(response)).workOrder
          .version;
      }

      expect(await stockOf(articleId)).toBe('6');
      expect(await ledgerSum(articleId)).toBe('6');
      expect(
        await harness.app.prisma.stockMovement.count({
          where: { workOrderId: order.id },
        }),
      ).toBe(3);
    });

    it('refuses to edit the lines of a completed order until it is reverted', async () => {
      const articleId = await seedArticle(harness, agent.userId);
      const order = await readyOrder(articleId);

      await changeStatus(order.id, {
        status: 'COMPLETED',
        version: order.version,
        odometerKmOut: 121_000,
      }).expect(200);

      await post(
        harness,
        agent,
        `/api/work-orders/${order.id}/lines`,
        labourLine(),
      ).expect(409);
    });

    it('never lands a line on an order that was completed at the same moment', async () => {
      // The narrow race the status predicate on the version bump exists for:
      // the line write reads an open order, the completion commits, and
      // without it the line would land on a `COMPLETED` order — a `PART` that
      // can never be deducted, because deduction has already run.
      const articleId = await seedArticle(harness, agent.userId, {
        openingStock: '10',
      });
      const order = await readyOrder(articleId);

      const [added, completed] = await Promise.all([
        post(
          harness,
          agent,
          `/api/work-orders/${order.id}/lines`,
          partLine(articleId, { quantity: '1' }),
        ),
        changeStatus(order.id, {
          status: 'COMPLETED',
          version: order.version,
          odometerKmOut: 121_000,
        }),
      ]);

      // **Three interleavings are all correct, and the test allows all three.**
      // Asserting one of them is how a race test becomes flaky and then gets
      // deleted — this one did, under a loaded `pnpm check`, before the third
      // case below was understood:
      //   * the line lands first, and the completion deducts both lines;
      //   * the completion lands first, and the line write is refused because
      //     the order is locked;
      //   * the line lands between the completion's read and its
      //     compare-and-swap, and the *completion* is refused because the
      //     version it is holding is now stale. That is the optimistic lock
      //     doing exactly its job (§6.5), not a failure.
      expect([201, 409]).toContain(added.status);
      expect([200, 409]).toContain(completed.status);

      const stored = await harness.app.prisma.workOrder.findUniqueOrThrow({
        where: { id: order.id },
        select: {
          status: true,
          lines: { select: { type: true, stockDeducted: true } },
        },
      });

      // The invariant that holds under all three: an order is never
      // `COMPLETED` carrying a `PART` line whose stock was not deducted.
      if (stored.status === 'COMPLETED') {
        expect(
          stored.lines.every(
            (line) => line.type !== 'PART' || line.stockDeducted,
          ),
        ).toBe(true);
      }

      // And the cached balance still equals the ledger, whichever way it went.
      expect(await stockOf(articleId)).toBe(await ledgerSum(articleId));
    });
  });
});
