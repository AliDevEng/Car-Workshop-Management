import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  workOrderHistoryResponseSchema,
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

/**
 * B6.8.1 — the customer and vehicle work-order histories reserved in B3
 * (PROJECT_SPEC.md §6.3).
 *
 * The vehicle is the spine of the system: history hangs off it, so an owner
 * can change without losing anything.
 */

describe('work-order history', () => {
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

  async function orderWithOneLine(description: string): Promise<string> {
    const created = workOrderResponseSchema.parse(
      jsonBody(
        await post(harness, agent, '/api/work-orders', {
          vehicleId: subject.vehicleId,
          customerId: subject.customerId,
          description,
        }).expect(201),
      ),
    ).workOrder;

    await post(
      harness,
      agent,
      `/api/work-orders/${created.id}/lines`,
      labourLine(),
    ).expect(201);

    return created.id;
  }

  it('lists a vehicle history newest first, with totals per row', async () => {
    const first = await orderWithOneLine('Första besöket');
    const second = await orderWithOneLine('Andra besöket');

    const body = workOrderHistoryResponseSchema.parse(
      jsonBody(
        await get(
          harness,
          agent,
          `/api/vehicles/${subject.vehicleId}/work-orders`,
        ),
      ),
    );

    expect(body.data.map((entry) => entry.id)).toEqual([second, first]);
    expect(body.data[0]?.totals.netOre).toBe(89_500);
    // A job still in progress belongs in the history: `completedAt` is null
    // on everything unfinished, and sorting by it would hide exactly the
    // rows a service adviser is looking for.
    expect(body.data[0]?.completedAt).toBeNull();
  });

  it('keeps a vehicle history when the car changes owner (§6.3)', async () => {
    const orderId = await orderWithOneLine('Före ägarbytet');

    const newOwner = await harness.app.prisma.customer.create({
      data: {
        type: 'PRIVATE',
        name: 'Björn Karlsson',
        phone: '070-765 43 21',
        phoneNormalised: '+46707654321',
      },
      select: { id: true },
    });

    await patch(harness, agent, `/api/vehicles/${subject.vehicleId}`, {
      customerId: newOwner.id,
    }).expect(200);

    const vehicleHistory = workOrderHistoryResponseSchema.parse(
      jsonBody(
        await get(
          harness,
          agent,
          `/api/vehicles/${subject.vehicleId}/work-orders`,
        ),
      ),
    );
    expect(vehicleHistory.data.map((entry) => entry.id)).toContain(orderId);

    // The job stays with the customer it was billed to, and does not follow
    // the car to its new owner.
    const oldOwnerHistory = workOrderHistoryResponseSchema.parse(
      jsonBody(
        await get(
          harness,
          agent,
          `/api/customers/${subject.customerId}/work-orders`,
        ),
      ),
    );
    expect(oldOwnerHistory.data.map((entry) => entry.id)).toContain(orderId);

    const newOwnerHistory = workOrderHistoryResponseSchema.parse(
      jsonBody(
        await get(harness, agent, `/api/customers/${newOwner.id}/work-orders`),
      ),
    );
    expect(newOwnerHistory.data).toEqual([]);

    // Put the car back, so the tests after this one see the fixture they set up.
    await patch(harness, agent, `/api/vehicles/${subject.vehicleId}`, {
      customerId: subject.customerId,
    }).expect(200);
  });

  it('paginates on a stable cursor', async () => {
    await orderWithOneLine('Sidbrytning');

    const firstPage = workOrderHistoryResponseSchema.parse(
      jsonBody(
        await get(
          harness,
          agent,
          `/api/vehicles/${subject.vehicleId}/work-orders?limit=1`,
        ),
      ),
    );
    expect(firstPage.data).toHaveLength(1);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = workOrderHistoryResponseSchema.parse(
      jsonBody(
        await get(
          harness,
          agent,
          `/api/vehicles/${subject.vehicleId}/work-orders?limit=1&cursor=${String(firstPage.nextCursor)}`,
        ),
      ),
    );
    expect(secondPage.data[0]?.id).not.toBe(firstPage.data[0]?.id);
  });

  it('answers 404 for a vehicle or customer that does not exist', async () => {
    await get(harness, agent, '/api/vehicles/missing/work-orders').expect(404);
    await get(harness, agent, '/api/customers/missing/work-orders').expect(404);
  });
});
