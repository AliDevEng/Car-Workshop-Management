import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import { Decimal } from 'decimal.js';
import {
  IDEMPOTENCY_KEY_HEADER,
  workOrderDetailSchema,
  workOrderHistoryResponseSchema,
  workOrderResponseSchema,
} from 'shared';
import { createTestApp, type TestApp } from './helpers/app.js';
import { loginAs, withAgent, type Agent } from './helpers/auth.js';
import { jsonBody } from './helpers/http.js';
import {
  get,
  labourLine,
  partLine,
  post,
  seedArticle,
  seedSubject,
  type SeededSubject,
} from './helpers/work-orders.js';

/**
 * B6 — the iteration's Definition of Done, end to end.
 *
 * *"A work order can be created, filled with lines, completed with stock
 * deduction, and cannot be double-completed even when the request is
 * retried."*
 *
 * Everything here goes through the HTTP API, in the order a mechanic would do
 * it, and every assertion is about state a person could check afterwards: the
 * shelf, the ledger, the car's history and the audit trail.
 */

describe('a job, run end to end (B6 Definition of Done)', () => {
  let harness: TestApp;
  let agent: Agent;
  let subject: SeededSubject;
  let oilId: string;
  let filterId: string;

  beforeAll(async () => {
    harness = await createTestApp();
    agent = await loginAs(harness, { role: 'ADMIN' });
    subject = await seedSubject(harness);
    oilId = await seedArticle(harness, agent.userId, { openingStock: '20' });
    filterId = await seedArticle(harness, agent.userId, {
      openingStock: '5',
      salesPriceOre: 24_900,
    });
  });

  afterAll(async () => {
    await harness.close();
  });

  async function stockOf(articleId: string): Promise<string> {
    const article = await harness.app.prisma.article.findUniqueOrThrow({
      where: { id: articleId },
      select: { stockQuantity: true },
    });
    return article.stockQuantity.toFixed();
  }

  async function ledgerSum(articleId: string): Promise<string> {
    const rows = await harness.app.prisma.stockMovement.findMany({
      where: { articleId },
      select: { quantity: true },
    });
    return rows
      .reduce((sum, row) => sum.plus(row.quantity.toFixed()), new Decimal(0))
      .toFixed();
  }

  it('runs a whole job and cannot be completed twice', async () => {
    // 1. The car comes in. The order starts as a numberless draft, because an
    //    abandoned draft must not spend a number from the series (§4.4).
    const draft = workOrderResponseSchema.parse(
      jsonBody(
        await post(harness, agent, '/api/work-orders', {
          vehicleId: subject.vehicleId,
          customerId: subject.customerId,
          description: 'Stor service',
          odometerKmIn: 118_400,
        }).expect(201),
      ),
    ).workOrder;

    expect(draft.status).toBe('DRAFT');
    expect(draft.number).toBeNull();

    // 2. Work starts, and the order is numbered from here on.
    const started = workOrderResponseSchema.parse(
      jsonBody(
        await post(harness, agent, `/api/work-orders/${draft.id}/status`, {
          status: 'IN_PROGRESS',
          version: draft.version,
        }).expect(200),
      ),
    ).workOrder;

    expect(started.number).toMatch(/^AO-\d{4}-\d{4}$/);

    // 3. Lines are added. Adding a part deducts nothing (§6.4).
    let version = started.version;
    for (const body of [
      labourLine({ description: 'Service, 2 timmar', quantity: '2' }),
      partLine(oilId, { quantity: '4.5' }),
      partLine(filterId, {
        description: 'Oljefilter',
        quantity: '1',
        unit: 'PIECE',
        unitPriceOre: 24_900,
      }),
    ]) {
      const response = await post(
        harness,
        agent,
        `/api/work-orders/${draft.id}/lines`,
        body,
      ).expect(201);
      version = workOrderResponseSchema.parse(jsonBody(response)).workOrder
        .version;
    }

    expect(await stockOf(oilId)).toBe('20');

    // 4. The totals, summed from already-rounded lines (§3.3):
    //      labour 2 × 895,00      = 179 000, VAT 44 750
    //      oil    4,5 × 129,99    =  58 496 (58 495,5 → 58 496), VAT 14 624
    //      filter 1 × 249,00      =  24 900, VAT  6 225
    //      net 262 396, VAT 65 599, gross 327 995 → 328 000 with 5 öre rounding
    const filled = workOrderDetailSchema.parse(
      jsonBody(await get(harness, agent, `/api/work-orders/${draft.id}`)),
    );
    expect(filled.totals).toEqual({
      netOre: 262_396,
      vatOre: 65_599,
      grossOre: 327_995,
      roundingOre: 5,
      roundedGrossOre: 328_000,
    });

    // 5. Completion. One request, with the key the tablet generated.
    const key = `journey-${crypto.randomUUID()}`;
    const completion = {
      status: 'COMPLETED',
      version,
      odometerKmOut: 118_460,
    };

    const completed = workOrderResponseSchema.parse(
      jsonBody(
        await withAgent(
          supertest(harness.app.server).post(
            `/api/work-orders/${draft.id}/status`,
          ),
          agent,
        )
          .set(IDEMPOTENCY_KEY_HEADER, key)
          .send(completion)
          .expect(200),
      ),
    );

    expect(completed.workOrder.status).toBe('COMPLETED');
    expect(completed.workOrder.completedByUserId).toBe(agent.userId);
    expect(completed.warnings).toEqual([]);
    expect(await stockOf(oilId)).toBe('15.5');
    expect(await stockOf(filterId)).toBe('4');

    // 6. The tablet's connection dropped, so it retries. The stored response
    //    comes back and nothing moves — the whole point of B6.6.
    const retry = await withAgent(
      supertest(harness.app.server).post(`/api/work-orders/${draft.id}/status`),
      agent,
    )
      .set(IDEMPOTENCY_KEY_HEADER, key)
      .send(completion)
      .expect(200);

    expect(jsonBody(retry)).toEqual(completed);
    expect(await stockOf(oilId)).toBe('15.5');
    expect(await ledgerSum(oilId)).toBe('15.5');
    expect(await ledgerSum(filterId)).toBe('4');
    expect(
      await harness.app.prisma.stockMovement.count({
        where: { workOrderId: draft.id },
      }),
    ).toBe(2);

    // 7. And without a key, the state machine refuses it anyway: no status
    //    transitions to itself, so a second tap is rejected rather than
    //    leaning on `stockDeducted` to save it (B1.4).
    await post(harness, agent, `/api/work-orders/${draft.id}/status`, {
      ...completion,
      version: completed.workOrder.version,
    }).expect(409);

    // 8. What a person can check afterwards.
    const readings = await harness.app.prisma.odometerReading.findMany({
      where: { workOrderId: draft.id },
      select: { km: true, source: true },
      orderBy: { km: 'asc' },
    });
    expect(readings).toEqual([
      { km: 118_400, source: 'WORK_ORDER_IN' },
      { km: 118_460, source: 'WORK_ORDER_OUT' },
    ]);

    const vehicle = await harness.app.prisma.vehicle.findUniqueOrThrow({
      where: { id: subject.vehicleId },
      select: { lastKnownOdometerKm: true },
    });
    expect(vehicle.lastKnownOdometerKm).toBe(118_460);

    const history = workOrderHistoryResponseSchema.parse(
      jsonBody(
        await get(
          harness,
          agent,
          `/api/vehicles/${subject.vehicleId}/work-orders`,
        ),
      ),
    );
    expect(history.data[0]?.number).toBe(started.number);
    expect(history.data[0]?.totals.roundedGrossOre).toBe(328_000);

    const audit = await harness.app.prisma.auditLog.findMany({
      where: { entityId: draft.id },
      select: { action: true },
      orderBy: { at: 'asc' },
    });
    expect(audit.map((row) => row.action)).toEqual([
      'work_order.created',
      'work_order.status_changed',
      'work_order.completed',
      // The refused second completion wrote nothing, which is the point.
    ]);

    // 9. The line snapshots survive a later price change (§4.2).
    const detail = workOrderDetailSchema.parse(
      jsonBody(await get(harness, agent, `/api/work-orders/${draft.id}`)),
    );
    expect(detail.lines.map((line) => line.unitPriceOre)).toEqual([
      89_500, 12_999, 24_900,
    ]);
    expect(detail.lines.filter((line) => line.stockDeducted)).toHaveLength(2);
  });
});
