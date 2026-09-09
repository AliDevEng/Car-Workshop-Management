import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bookingWithRelationsSchema, calendarResponseSchema } from 'shared';
import { createTestApp, type TestApp } from './helpers/app.js';
import { jsonBody } from './helpers/http.js';
import { loginAs, seedUser, withAgent, type Agent } from './helpers/auth.js';
import {
  seedBookingRequest,
  submit,
  validSubmission,
} from './helpers/bookings.js';

/**
 * B5.6 — the booking journey end to end (PROJECT_SPEC.md §6.2).
 *
 * The second test here **is** B5's Definition of Done: *two simultaneous
 * confirmations into the same slot for the same mechanic produce exactly one
 * booking and one 409*.
 */

const SLOT = {
  startsAt: '2026-04-14T08:00:00.000Z',
  endsAt: '2026-04-14T10:00:00.000Z',
};

function confirm(
  harness: TestApp,
  agent: Agent,
  requestId: string,
  body: Record<string, unknown>,
): supertest.Test {
  return withAgent(
    supertest(harness.app.server).post(
      `/api/booking-requests/${requestId}/confirm`,
    ),
    agent,
  ).send(body);
}

describe('a public request becomes one calendar booking (B5.6.1)', () => {
  let harness: TestApp;
  let staff: Agent;
  let mechanic: string;

  beforeAll(async () => {
    harness = await createTestApp();
    staff = await loginAs(harness, { role: 'ADMIN' });
    mechanic = (await seedUser(harness, { name: 'Mekaniker' })).id;
  });

  afterAll(async () => {
    await harness.close();
  });

  it('creates the customer, the vehicle and the booking in one step', async () => {
    await submit(
      harness,
      validSubmission(harness, {
        customerName: 'Anna Svensson',
        phone: '070-123 45 67',
        email: 'anna@example.se',
        regNr: 'xyz 98a',
        message: 'Servicelampan lyser.',
      }),
    ).expect(201);

    const request = await harness.app.prisma.bookingRequest.findFirstOrThrow();

    const booking = bookingWithRelationsSchema.parse(
      jsonBody(
        await confirm(harness, staff, request.id, {
          ...SLOT,
          assignedUserId: mechanic,
          note: 'Tar ca 2 timmar.',
        }).expect(201),
      ),
    );

    expect(booking.status).toBe('SCHEDULED');
    expect(booking.customer.name).toBe('Anna Svensson');
    expect(booking.vehicle?.registrationNumber).toBe('XYZ98A');
    expect(booking.assignedUser?.id).toBe(mechanic);

    // The vehicle was unknown until now, so it is created with the plate and
    // placeholders a human replaces — refusing the confirmation instead would
    // leave the booking with no car for B6's work order to hang off.
    const vehicle = await harness.app.prisma.vehicle.findUniqueOrThrow({
      where: { registrationNumber: 'XYZ98A' },
    });
    expect(vehicle.make).toBe('Okänt fabrikat');
    expect(vehicle.customerId).toBe(booking.customerId);

    // The request is closed, and closed by a named person.
    const handled = await harness.app.prisma.bookingRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(handled.status).toBe('CONFIRMED');
    expect(handled.handledByUserId).toBe(staff.userId);

    // One booking, and it is on the calendar.
    const calendar = calendarResponseSchema.parse(
      jsonBody(
        await supertest(harness.app.server)
          .get(
            '/api/bookings?from=2026-04-14T08:00:00Z&to=2026-04-14T08:00:00Z',
          )
          .set('cookie', staff.cookies.join('; '))
          .expect(200),
      ),
    );
    expect(calendar.data.map((row) => row.id)).toEqual([booking.id]);

    for (const action of [
      'booking_request.confirmed',
      'booking.created',
      'customer.created',
      'vehicle.created',
    ]) {
      expect(
        await harness.app.prisma.auditLog.count({ where: { action } }),
      ).toBe(1);
    }
  });

  it('reuses the customer and the car on a second visit', async () => {
    // Matched on `phoneNormalised`, which is what keeps a returning customer
    // one row rather than five (§8.2). The plate matches the vehicle created
    // above, so the service history stays on one car (§6.3).
    const requestId = await seedBookingRequest(harness, {
      customerName: 'Anna S',
      phone: '+46 70 123 45 67',
      regNr: 'XYZ98A',
    });

    const booking = bookingWithRelationsSchema.parse(
      jsonBody(
        await confirm(harness, staff, requestId, {
          startsAt: '2026-04-21T08:00:00.000Z',
          endsAt: '2026-04-21T10:00:00.000Z',
        }).expect(201),
      ),
    );

    expect(booking.customer.name).toBe('Anna Svensson');
    expect(await harness.app.prisma.customer.count()).toBe(1);
    expect(await harness.app.prisma.vehicle.count()).toBe(1);
    expect(booking.vehicle?.id).not.toBeUndefined();
  });

  it('still books a request whose plate cannot be a vehicle', async () => {
    // A stranger typed something that is not a plate. `Vehicle` would refuse
    // it — the column carries §4.2's unique index — so an unusable plate is
    // treated as no plate and a human attaches the right car later. Throwing
    // instead would make the request permanently unconfirmable over a typo,
    // and §4.2 is explicit that a plate must never block a booking.
    const requestId = await seedBookingRequest(harness, {
      phone: '070-444 44 44',
      regNr: 'ABCDEFGHIJKL',
    });

    const booking = bookingWithRelationsSchema.parse(
      jsonBody(
        await confirm(harness, staff, requestId, {
          startsAt: '2026-04-24T08:00:00.000Z',
          endsAt: '2026-04-24T10:00:00.000Z',
        }).expect(201),
      ),
    );

    expect(booking.vehicleId).toBeNull();
    // The text stays on the request, so the staff member can read what the
    // customer meant.
    const request = await harness.app.prisma.bookingRequest.findUniqueOrThrow({
      where: { id: requestId },
    });
    expect(request.regNr).toBe('ABCDEFGHIJKL');
  });

  it('refuses a slot that ends before it starts', async () => {
    const requestId = await seedBookingRequest(harness, {
      phone: '070-666 66 66',
      regNr: null,
    });

    await confirm(harness, staff, requestId, {
      startsAt: '2026-04-25T10:00:00.000Z',
      endsAt: '2026-04-25T08:00:00.000Z',
    }).expect(400);

    // A zero-length booking overlaps nothing, so the exclusion constraint
    // would happily accept two of them in the same slot.
    await confirm(harness, staff, requestId, {
      startsAt: '2026-04-25T10:00:00.000Z',
      endsAt: '2026-04-25T10:00:00.000Z',
    }).expect(400);
  });

  it('refuses to confirm a request that has already been confirmed', async () => {
    const requestId = await seedBookingRequest(harness, {
      phone: '070-555 00 11',
      regNr: null,
    });
    const slot = {
      startsAt: '2026-04-22T08:00:00.000Z',
      endsAt: '2026-04-22T10:00:00.000Z',
    };

    await confirm(harness, staff, requestId, slot).expect(201);
    await confirm(harness, staff, requestId, {
      startsAt: '2026-04-23T08:00:00.000Z',
      endsAt: '2026-04-23T10:00:00.000Z',
    }).expect(409);

    expect(
      await harness.app.prisma.booking.count({
        where: { bookingRequestId: requestId },
      }),
    ).toBe(1);
  });
});

describe("B5's Definition of Done — two confirmations, one slot (B5.6.2)", () => {
  let harness: TestApp;
  let staff: Agent;
  let mechanic: string;

  beforeAll(async () => {
    harness = await createTestApp();
    staff = await loginAs(harness, { role: 'ADMIN' });
    mechanic = (await seedUser(harness, { name: 'Mekaniker' })).id;
  });

  afterAll(async () => {
    await harness.close();
  });

  it('produces exactly one booking and one 409', async () => {
    // Two different requests — two owners in the same room, each with the
    // inbox open, each confirming into Tuesday morning. Reading the calendar
    // first and inserting if it looked free is precisely the race this loses;
    // the `EXCLUDE USING gist` constraint is what does not.
    const [first, second] = await Promise.all([
      seedBookingRequest(harness, { phone: '070-111 11 11', regNr: 'BBB11B' }),
      seedBookingRequest(harness, { phone: '070-222 22 22', regNr: 'CCC22C' }),
    ]);

    const responses = await Promise.all([
      confirm(harness, staff, first, { ...SLOT, assignedUserId: mechanic }),
      confirm(harness, staff, second, { ...SLOT, assignedUserId: mechanic }),
    ]);

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([201, 409]);

    expect(await harness.app.prisma.booking.count()).toBe(1);

    // And the losing request is untouched, so a human can still place it
    // somewhere else rather than having to work out what half-happened.
    const requests = await harness.app.prisma.bookingRequest.findMany({
      select: { status: true },
      orderBy: { id: 'asc' },
    });
    expect(requests.map((row) => row.status).sort()).toEqual([
      'CONFIRMED',
      'PENDING',
    ]);
  });

  it('holds when the same request is double-tapped concurrently', async () => {
    // A laggy tablet and an impatient thumb. The status check inside the
    // transaction and the unique `bookingRequestId` both stand behind this.
    const requestId = await seedBookingRequest(harness, {
      phone: '070-333 33 33',
      regNr: 'DDD33D',
    });
    const slot = {
      startsAt: '2026-04-28T08:00:00.000Z',
      endsAt: '2026-04-28T10:00:00.000Z',
      assignedUserId: mechanic,
    };

    const responses = await Promise.all([
      confirm(harness, staff, requestId, slot),
      confirm(harness, staff, requestId, slot),
    ]);

    expect(
      responses.filter((response) => response.status === 201),
    ).toHaveLength(1);
    expect(
      await harness.app.prisma.booking.count({
        where: { bookingRequestId: requestId },
      }),
    ).toBe(1);
  });
});
