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
  del,
  get,
  labourLine,
  partLine,
  patch,
  post,
  seedArticle,
  seedSubject,
  type SeededSubject,
} from './helpers/work-orders.js';

/**
 * B6.2, B6.3 — work-order lines and the totals they add up to
 * (PROJECT_SPEC.md §4.2, §3.3, §6.5).
 */

describe('work-order lines', () => {
  let harness: TestApp;
  let agent: Agent;
  let subject: SeededSubject;
  let articleId: string;

  beforeAll(async () => {
    harness = await createTestApp();
    agent = await loginAs(harness, { role: 'ADMIN' });
    subject = await seedSubject(harness);
    articleId = await seedArticle(harness, agent.userId);
  });

  afterAll(async () => {
    await harness.close();
  });

  async function newOrder(): Promise<string> {
    const response = await post(harness, agent, '/api/work-orders', {
      vehicleId: subject.vehicleId,
      customerId: subject.customerId,
      description: 'Stor service',
    }).expect(201);
    return workOrderResponseSchema.parse(jsonBody(response)).workOrder.id;
  }

  async function addLine(
    orderId: string,
    body: Record<string, unknown>,
  ): Promise<string> {
    const response = await post(
      harness,
      agent,
      `/api/work-orders/${orderId}/lines`,
      body,
    ).expect(201);
    const parsed = workOrderResponseSchema.parse(jsonBody(response));
    const added = parsed.workOrder.lines.at(-1);
    if (added === undefined) {
      throw new Error('The response did not contain the line it just created');
    }
    return added.id;
  }

  describe('adding a line (B6.2.2)', () => {
    it('answers with the whole order, its lines and its recomputed totals', async () => {
      const orderId = await newOrder();

      const response = await post(
        harness,
        agent,
        `/api/work-orders/${orderId}/lines`,
        partLine(articleId),
      ).expect(201);

      const body = workOrderResponseSchema.parse(jsonBody(response));
      const [line] = body.workOrder.lines;

      expect(body.workOrder.lines).toHaveLength(1);
      expect(line?.sortOrder).toBe(0);
      // 129,99 × 4 = 519,96 kr net, 25 % VAT.
      expect(line?.totals).toEqual({
        netOre: 51_996,
        vatOre: 12_999,
        grossOre: 64_995,
      });
      expect(body.workOrder.totals.grossOre).toBe(64_995);
      expect(body.workOrder.totals.roundedGrossOre).toBe(65_000);
    });

    it('deducts no stock — that happens once, on completion (§6.4)', async () => {
      const before = await harness.app.prisma.article.findUniqueOrThrow({
        where: { id: articleId },
        select: { stockQuantity: true },
      });

      const orderId = await newOrder();
      await addLine(orderId, partLine(articleId));

      const after = await harness.app.prisma.article.findUniqueOrThrow({
        where: { id: articleId },
        select: { stockQuantity: true },
      });
      expect(after.stockQuantity.toFixed()).toBe(
        before.stockQuantity.toFixed(),
      );
    });

    it('bumps the parent version without requiring one (B6.4.2)', async () => {
      const orderId = await newOrder();

      // No `version` in the body at all: two mechanics adding different lines
      // to one job is correct behaviour and must not fail.
      const response = await post(
        harness,
        agent,
        `/api/work-orders/${orderId}/lines`,
        labourLine(),
      ).expect(201);

      expect(
        workOrderResponseSchema.parse(jsonBody(response)).workOrder.version,
      ).toBe(1);
    });

    it('puts each new line at the bottom', async () => {
      const orderId = await newOrder();
      await addLine(orderId, labourLine({ description: 'Först' }));
      await addLine(orderId, labourLine({ description: 'Sedan' }));

      const detail = workOrderDetailSchema.parse(
        jsonBody(await get(harness, agent, `/api/work-orders/${orderId}`)),
      );
      expect(detail.lines.map((line) => line.description)).toEqual([
        'Först',
        'Sedan',
      ]);
      expect(detail.lines.map((line) => line.sortOrder)).toEqual([0, 1]);
    });

    it('refuses an article that does not exist, by field', async () => {
      const orderId = await newOrder();

      const response = await post(
        harness,
        agent,
        `/api/work-orders/${orderId}/lines`,
        partLine('missing'),
      ).expect(400);

      expect(JSON.stringify(jsonBody(response))).toContain('articleId');
    });

    it('refuses a quantity of zero', async () => {
      const orderId = await newOrder();

      const response = await post(
        harness,
        agent,
        `/api/work-orders/${orderId}/lines`,
        partLine(articleId, { quantity: '0' }),
      ).expect(400);

      expect(JSON.stringify(jsonBody(response))).toContain('quantity');
    });

    it('rejects a quantity with a fourth decimal place at the boundary', async () => {
      const orderId = await newOrder();

      const response = await post(
        harness,
        agent,
        `/api/work-orders/${orderId}/lines`,
        partLine(articleId, { quantity: '4.2501' }),
      ).expect(400);

      expect(apiErrorSchema.parse(jsonBody(response)).error.code).toBe(
        'VALIDATION_FAILED',
      );
    });
  });

  describe('the snapshot (B6.2.5)', () => {
    it('does not change when the article price changes afterwards', async () => {
      const orderId = await newOrder();
      await addLine(orderId, partLine(articleId));

      // The catalogue moves; history does not.
      await patch(harness, agent, `/api/articles/${articleId}`, {
        salesPriceOre: 19_900,
        name: 'Motorolja 5W-30 (ny leverantör)',
      }).expect(200);

      const detail = workOrderDetailSchema.parse(
        jsonBody(await get(harness, agent, `/api/work-orders/${orderId}`)),
      );
      const [line] = detail.lines;

      expect(line?.unitPriceOre).toBe(12_999);
      expect(line?.description).toBe('Motorolja 5W-30');
      expect(detail.totals.netOre).toBe(51_996);
    });
  });

  describe('editing and removing (B6.2.3)', () => {
    it('recomputes the totals after a patch', async () => {
      const orderId = await newOrder();
      const lineId = await addLine(orderId, partLine(articleId));

      const response = await patch(
        harness,
        agent,
        `/api/work-orders/${orderId}/lines/${lineId}`,
        { quantity: '2' },
      ).expect(200);

      const body = workOrderResponseSchema.parse(jsonBody(response));
      expect(body.workOrder.totals.netOre).toBe(25_998);
    });

    it('removes a line and its contribution to the totals', async () => {
      const orderId = await newOrder();
      const first = await addLine(orderId, partLine(articleId));
      await addLine(orderId, labourLine());

      const response = await del(
        harness,
        agent,
        `/api/work-orders/${orderId}/lines/${first}`,
      ).expect(200);

      const body = workOrderResponseSchema.parse(jsonBody(response));
      expect(body.workOrder.lines).toHaveLength(1);
      expect(body.workOrder.totals.netOre).toBe(89_500);
    });

    it('answers 404 for a line belonging to a different order', async () => {
      const orderId = await newOrder();
      const otherOrderId = await newOrder();
      const lineId = await addLine(otherOrderId, labourLine());

      // Not a 403: the resource named by *this* path does not exist, and any
      // other answer confirms that some other order has a line with that id.
      await patch(
        harness,
        agent,
        `/api/work-orders/${orderId}/lines/${lineId}`,
        { quantity: '2' },
      ).expect(404);
    });
  });

  describe('reordering (B6.2.4)', () => {
    it('renumbers every line from the list it was given', async () => {
      const orderId = await newOrder();
      const a = await addLine(orderId, labourLine({ description: 'A' }));
      const b = await addLine(orderId, labourLine({ description: 'B' }));
      const c = await addLine(orderId, labourLine({ description: 'C' }));

      const response = await post(
        harness,
        agent,
        `/api/work-orders/${orderId}/lines/reorder`,
        { lineIds: [c, a, b] },
      ).expect(200);

      const body = workOrderResponseSchema.parse(jsonBody(response));
      expect(body.workOrder.lines.map((line) => line.description)).toEqual([
        'C',
        'A',
        'B',
      ]);
      expect(body.workOrder.lines.map((line) => line.sortOrder)).toEqual([
        0, 1, 2,
      ]);
    });

    it('refuses a partial list, which would leave positions colliding', async () => {
      const orderId = await newOrder();
      const a = await addLine(orderId, labourLine({ description: 'A' }));
      await addLine(orderId, labourLine({ description: 'B' }));

      const response = await post(
        harness,
        agent,
        `/api/work-orders/${orderId}/lines/reorder`,
        { lineIds: [a] },
      ).expect(400);

      expect(JSON.stringify(jsonBody(response))).toContain('lineIds');
    });

    it('refuses a list with a duplicate', async () => {
      const orderId = await newOrder();
      const a = await addLine(orderId, labourLine({ description: 'A' }));
      await addLine(orderId, labourLine({ description: 'B' }));

      await post(harness, agent, `/api/work-orders/${orderId}/lines/reorder`, {
        lineIds: [a, a],
      }).expect(400);
    });
  });
});
