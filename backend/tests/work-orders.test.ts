import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  apiErrorSchema,
  workOrderDetailSchema,
  workOrderListResponseSchema,
  workOrderResponseSchema,
} from 'shared';
import { createTestApp, type TestApp } from './helpers/app.js';
import { loginAs, seedUser, type Agent } from './helpers/auth.js';
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
 * B6.1, B6.3, B6.7 — the work-order record, its totals and its odometer
 * capture (PROJECT_SPEC.md §4.2, §4.4, §6.5).
 */

describe('work orders', () => {
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

  async function createOrder(
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: string; version: number; number: string | null }> {
    const response = await post(harness, agent, '/api/work-orders', {
      vehicleId: subject.vehicleId,
      customerId: subject.customerId,
      description: 'Stor service',
      ...overrides,
    }).expect(201);

    const body = workOrderResponseSchema.parse(jsonBody(response));
    return {
      id: body.workOrder.id,
      version: body.workOrder.version,
      number: body.workOrder.number,
    };
  }

  describe('creation (B6.1.3)', () => {
    it('starts as a numberless DRAFT', async () => {
      const created = await createOrder();

      // §4.4 spends a number when a document stops being an abandonable
      // draft, not when the draft is created — otherwise every abandoned job
      // leaves a hole in the series.
      expect(created.number).toBeNull();

      const detail = workOrderDetailSchema.parse(
        jsonBody(await get(harness, agent, `/api/work-orders/${created.id}`)),
      );
      expect(detail.status).toBe('DRAFT');
      expect(detail.version).toBe(0);
      expect(detail.lines).toEqual([]);
      expect(detail.totals.grossOre).toBe(0);
    });

    it('carries the customer and vehicle summaries the screen needs', async () => {
      const created = await createOrder();
      const detail = workOrderDetailSchema.parse(
        jsonBody(await get(harness, agent, `/api/work-orders/${created.id}`)),
      );

      expect(detail.customer.name).toBe('Anna Svensson');
      expect(detail.vehicle.make).toBe('Volvo');
      expect(detail.assignedUser).toBeNull();
    });

    it('refuses a vehicle or customer that does not exist, by field', async () => {
      const response = await post(harness, agent, '/api/work-orders', {
        vehicleId: subject.vehicleId,
        customerId: 'nope',
        description: 'Stor service',
      }).expect(400);

      const body = apiErrorSchema.parse(jsonBody(response));
      expect(body.error.code).toBe('VALIDATION_FAILED');
      expect(JSON.stringify(body.error.details)).toContain('customerId');
    });

    it('refuses a deactivated mechanic', async () => {
      const inactive = await seedUser(harness, { isActive: false });

      const response = await post(harness, agent, '/api/work-orders', {
        vehicleId: subject.vehicleId,
        customerId: subject.customerId,
        description: 'Stor service',
        assignedUserId: inactive.id,
      }).expect(400);

      expect(JSON.stringify(jsonBody(response))).toContain('assignedUserId');
    });

    it('can be created from a booking (B6.8.3)', async () => {
      const booking = await harness.app.prisma.booking.create({
        data: {
          customerId: subject.customerId,
          vehicleId: subject.vehicleId,
          startsAt: new Date('2026-04-01T07:00:00.000Z'),
          endsAt: new Date('2026-04-01T09:00:00.000Z'),
        },
        select: { id: true },
      });

      const created = await createOrder({ bookingId: booking.id });

      // The calendar's link from a slot to the job it became.
      const list = workOrderListResponseSchema.parse(
        jsonBody(
          await get(harness, agent, `/api/work-orders?bookingId=${booking.id}`),
        ),
      );
      expect(list.data.map((row) => row.id)).toEqual([created.id]);
    });
  });

  describe('the arrival odometer (B6.7.1)', () => {
    it('writes a WORK_ORDER_IN reading and refreshes the vehicle cache', async () => {
      const created = await createOrder({ odometerKmIn: 120_000 });

      const readings = await harness.app.prisma.odometerReading.findMany({
        where: { workOrderId: created.id },
        select: { km: true, source: true },
      });
      expect(readings).toEqual([{ km: 120_000, source: 'WORK_ORDER_IN' }]);

      const vehicle = await harness.app.prisma.vehicle.findUniqueOrThrow({
        where: { id: subject.vehicleId },
        select: { lastKnownOdometerKm: true },
      });
      expect(vehicle.lastKnownOdometerKm).toBe(120_000);
    });

    it('surfaces the B3.3 low-reading warning rather than refusing (B6.7.2)', async () => {
      // A reading below the previous highest is accepted — clusters get
      // replaced — but a human is told to check it.
      const response = await post(harness, agent, '/api/work-orders', {
        vehicleId: subject.vehicleId,
        customerId: subject.customerId,
        description: 'Bromsar',
        odometerKmIn: 90_000,
      }).expect(201);

      const body = workOrderResponseSchema.parse(jsonBody(response));
      expect(body.warnings).toHaveLength(1);
      expect(body.warnings[0]).toContain('lägre');
      // In mil, because the sentence is read by a person (§3.5).
      expect(body.warnings[0]).toContain('9000,0 mil');
    });
  });

  describe('header edits (B6.4.2)', () => {
    it('applies a patch and bumps the version', async () => {
      const created = await createOrder();

      const response = await patch(
        harness,
        agent,
        `/api/work-orders/${created.id}`,
        { description: 'Stor service + bromsar', version: created.version },
      ).expect(200);

      const body = workOrderResponseSchema.parse(jsonBody(response));
      expect(body.workOrder.description).toBe('Stor service + bromsar');
      expect(body.workOrder.version).toBe(created.version + 1);
    });

    it('records an odometer reading when the patch sets one, and only then', async () => {
      const created = await createOrder({ odometerKmIn: 130_000 });

      await patch(harness, agent, `/api/work-orders/${created.id}`, {
        odometerKmIn: 130_000,
        version: created.version,
      }).expect(200);

      // Saving the same form twice must not add a second reading.
      const unchanged = await harness.app.prisma.odometerReading.count({
        where: { workOrderId: created.id },
      });
      expect(unchanged).toBe(1);

      await patch(harness, agent, `/api/work-orders/${created.id}`, {
        odometerKmIn: 131_000,
        version: created.version + 1,
      }).expect(200);

      const after = await harness.app.prisma.odometerReading.count({
        where: { workOrderId: created.id },
      });
      expect(after).toBe(2);
    });

    it('can unassign a mechanic with an explicit null', async () => {
      const mechanic = await seedUser(harness);
      const created = await createOrder({ assignedUserId: mechanic.id });

      const response = await patch(
        harness,
        agent,
        `/api/work-orders/${created.id}`,
        { assignedUserId: null, version: created.version },
      ).expect(200);

      expect(
        workOrderResponseSchema.parse(jsonBody(response)).workOrder
          .assignedUserId,
      ).toBeNull();
    });

    it('answers 404 for an order that does not exist', async () => {
      await patch(harness, agent, '/api/work-orders/missing', {
        description: 'x',
        version: 0,
      }).expect(404);
    });
  });

  describe('the list (B6.1.3)', () => {
    it('filters by status and carries totals per row', async () => {
      const created = await createOrder();
      await post(
        harness,
        agent,
        `/api/work-orders/${created.id}/lines`,
        labourLine(),
      ).expect(201);

      const list = workOrderListResponseSchema.parse(
        jsonBody(await get(harness, agent, '/api/work-orders?status=DRAFT')),
      );

      const row = list.data.find((entry) => entry.id === created.id);
      expect(row?.status).toBe('DRAFT');
      expect(row?.lineCount).toBe(1);
      // 895,00 kr net, 25 % VAT, and a gross that needs no rounding.
      expect(row?.totals.netOre).toBe(89_500);
      expect(row?.totals.vatOre).toBe(22_375);
      expect(row?.totals.roundedGrossOre).toBe(111_900);
      expect(list.data.every((entry) => entry.status === 'DRAFT')).toBe(true);
    });

    it('returns no Decimal objects anywhere on the wire (§8.2)', async () => {
      const created = await createOrder();
      await post(
        harness,
        agent,
        `/api/work-orders/${created.id}/lines`,
        labourLine({ quantity: '1.25' }),
      ).expect(201);

      // The list carries totals but not lines, so both shapes are checked:
      // a `Decimal` reaching the serialiser is either a 500 or the string
      // `[object Object]` on a customer's document, depending on the field.
      const list = (await get(harness, agent, '/api/work-orders')).text;
      expect(list).not.toContain('[object Object]');
      expect(list).toContain('"netOre":111875');

      const detail = (
        await get(harness, agent, `/api/work-orders/${created.id}`)
      ).text;
      expect(detail).not.toContain('[object Object]');
      expect(detail).toContain('"quantity":"1.25"');
    });
  });

  describe('authorisation', () => {
    it('refuses an unauthenticated caller', async () => {
      const { default: supertest } = await import('supertest');
      await supertest(harness.app.server).get('/api/work-orders').expect(401);
    });
  });
});
