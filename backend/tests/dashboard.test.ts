import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import { dashboardSchema, workOrderResponseSchema } from 'shared';
import { createTestApp, type TestApp } from './helpers/app.js';
import { loginAs, type Agent } from './helpers/auth.js';
import { jsonBody } from './helpers/http.js';
import {
  get,
  labourLine,
  post,
  seedArticle,
  seedSubject,
  type SeededSubject,
} from './helpers/work-orders.js';

/**
 * B6.8.2 — the typed reads F5 needs (PROJECT_SPEC.md §6.8).
 *
 * "What is happening today", answered in one request so every card agrees
 * about what today is — and about *where* today is, because the workshop is
 * in Europe/Stockholm and the container is in UTC (§3.6).
 */

describe('the dashboard', () => {
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

  function read(query = ''): Promise<unknown> {
    return get(harness, agent, `/api/dashboard${query}`).then((response) =>
      jsonBody(response),
    );
  }

  async function orderInStatus(status: 'AWAITING_PARTS'): Promise<void> {
    const created = workOrderResponseSchema.parse(
      jsonBody(
        await post(harness, agent, '/api/work-orders', {
          vehicleId: subject.vehicleId,
          customerId: subject.customerId,
          description: 'Väntar på delar',
        }).expect(201),
      ),
    ).workOrder;

    const started = workOrderResponseSchema.parse(
      jsonBody(
        await post(harness, agent, `/api/work-orders/${created.id}/status`, {
          status: 'IN_PROGRESS',
          version: created.version,
        }).expect(200),
      ),
    ).workOrder;

    await post(harness, agent, `/api/work-orders/${created.id}/status`, {
      status,
      version: started.version,
    }).expect(200);
  }

  it('answers with a Europe/Stockholm day and the UTC window it covers', async () => {
    // 29 March 2026 is 23 hours long in Sweden; 25 October is 25. A window
    // built by adding 24 hours loses an hour of bookings twice a year.
    const spring = dashboardSchema.parse(await read('?date=2026-03-29'));
    expect(spring.from).toBe('2026-03-28T23:00:00.000Z');
    expect(spring.to).toBe('2026-03-29T22:00:00.000Z');

    const autumn = dashboardSchema.parse(await read('?date=2026-10-25'));
    expect(autumn.from).toBe('2026-10-24T22:00:00.000Z');
    expect(autumn.to).toBe('2026-10-25T23:00:00.000Z');
  });

  it('defaults to today in Stockholm rather than today in UTC', async () => {
    const body = dashboardSchema.parse(await read());
    const stockholmToday = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Stockholm',
    }).format(new Date());

    expect(body.date).toBe(stockholmToday);
  });

  it("lists the day's bookings, including one that started yesterday", async () => {
    await harness.app.prisma.booking.createMany({
      data: [
        {
          customerId: subject.customerId,
          vehicleId: subject.vehicleId,
          startsAt: new Date('2026-04-14T07:00:00.000Z'),
          endsAt: new Date('2026-04-14T09:00:00.000Z'),
        },
        // Began the day before and runs into this one: it belongs on today's
        // calendar, and a view that hid it would lie about the workshop's day.
        {
          customerId: subject.customerId,
          vehicleId: subject.vehicleId,
          startsAt: new Date('2026-04-13T15:00:00.000Z'),
          endsAt: new Date('2026-04-14T08:00:00.000Z'),
        },
        {
          customerId: subject.customerId,
          vehicleId: subject.vehicleId,
          startsAt: new Date('2026-04-20T07:00:00.000Z'),
          endsAt: new Date('2026-04-20T09:00:00.000Z'),
        },
      ],
    });

    const body = dashboardSchema.parse(await read('?date=2026-04-14'));
    expect(body.todaysBookings).toHaveLength(2);
    expect(
      body.todaysBookings.every((booking) => booking.customer.name !== ''),
    ).toBe(true);
  });

  it('counts unhandled booking requests, matching the navigation badge', async () => {
    await harness.app.prisma.bookingRequest.createMany({
      data: [
        { customerName: 'A', phone: '0700000001', serviceTypeIds: [] },
        { customerName: 'B', phone: '0700000002', serviceTypeIds: [] },
        {
          customerName: 'C',
          phone: '0700000003',
          serviceTypeIds: [],
          status: 'REJECTED',
        },
      ],
    });

    expect(dashboardSchema.parse(await read()).unhandledBookingRequests).toBe(
      2,
    );
  });

  it('counts work that is stuck and work that is waiting for a customer', async () => {
    await orderInStatus('AWAITING_PARTS');

    const body = dashboardSchema.parse(await read());
    expect(body.awaitingParts).toBe(1);
    expect(body.readyForPickup).toBe(0);
  });

  it('lists inspections due soon, including overdue ones', async () => {
    const today = new Date();
    const inDays = (days: number): Date => {
      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() + days);
      return new Date(date.toISOString().slice(0, 10));
    };

    await harness.app.prisma.vehicle.update({
      where: { id: subject.vehicleId },
      data: { nextInspectionDueDate: inDays(-5) },
    });
    const soon = await harness.app.prisma.vehicle.create({
      data: {
        registrationNumber: 'ZZZ99Z',
        registrationNumberDisplay: 'ZZZ 99Z',
        make: 'Saab',
        model: '9-3',
        nextInspectionDueDate: inDays(30),
      },
      select: { id: true },
    });
    await harness.app.prisma.vehicle.create({
      data: {
        registrationNumber: 'YYY88Y',
        registrationNumberDisplay: 'YYY 88Y',
        make: 'Saab',
        model: '9-5',
        nextInspectionDueDate: inDays(120),
      },
    });
    // Long overdue: sold, scrapped, or someone else's problem. Because the
    // list is ordered by due date, an unbounded lower end would put rows like
    // this one at the top and push every car worth calling about off it.
    await harness.app.prisma.vehicle.create({
      data: {
        registrationNumber: 'XXX77X',
        registrationNumberDisplay: 'XXX 77X',
        make: 'Saab',
        model: '900',
        nextInspectionDueDate: inDays(-500),
      },
    });

    const body = dashboardSchema.parse(await read());
    const ids = body.inspectionsDueSoon.map((vehicle) => vehicle.id);

    // Recently overdue first: a car whose inspection expired last week is the
    // one the workshop most wants to ring about, not the one to drop.
    expect(ids).toEqual([subject.vehicleId, soon.id]);
    expect(body.inspectionsDueSoonCount).toBe(2);
    expect(body.inspectionsDueSoon[0]?.customer?.name).toBe('Anna Svensson');
    expect(body.inspectionsDueSoon[1]?.customer).toBeNull();
  });

  it('counts articles below their minimum', async () => {
    await seedArticle(harness, agent.userId, {
      openingStock: '1',
      minimumQuantity: '5',
    });
    await seedArticle(harness, agent.userId, {
      openingStock: '50',
      minimumQuantity: '5',
    });

    expect(dashboardSchema.parse(await read()).lowStockArticles).toBe(1);
  });

  it('rejects a date that is not a real day', async () => {
    await get(harness, agent, '/api/dashboard?date=2026-02-30').expect(400);
  });

  it('requires a session', async () => {
    await supertest(harness.app.server).get('/api/dashboard').expect(401);
  });

  it('is unaffected by work orders that are only drafts', async () => {
    await post(harness, agent, '/api/work-orders', {
      vehicleId: subject.vehicleId,
      customerId: subject.customerId,
      description: 'Utkast',
    }).expect(201);
    await post(
      harness,
      agent,
      `/api/work-orders/${String(
        workOrderResponseSchema.parse(
          jsonBody(
            await post(harness, agent, '/api/work-orders', {
              vehicleId: subject.vehicleId,
              customerId: subject.customerId,
              description: 'Utkast 2',
            }).expect(201),
          ),
        ).workOrder.id,
      )}/lines`,
      labourLine(),
    ).expect(201);

    const body = dashboardSchema.parse(await read());
    expect(body.awaitingParts).toBe(1);
    expect(body.readyForPickup).toBe(0);
  });
});
