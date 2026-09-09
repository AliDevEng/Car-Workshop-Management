import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  apiErrorSchema,
  bookingWithRelationsSchema,
  calendarResponseSchema,
  stockholmWallClock,
  stockholmWallClockToUtc,
} from 'shared';
import { createTestApp, type TestApp } from './helpers/app.js';
import { jsonBody } from './helpers/http.js';
import { loginAs, seedUser, withAgent, type Agent } from './helpers/auth.js';
import { seedBookingRequest } from './helpers/bookings.js';

/**
 * B5.4, B5.5 — the calendar (PROJECT_SPEC.md §3.6, §6.2).
 *
 * Bookings are created through the real confirmation endpoint rather than
 * inserted directly: the exclusion constraint is only worth testing on the
 * path production actually takes, and B0.10.3 measured that the Prisma error
 * code differs between paths.
 */

let plate = 0;

/** A confirmable request, with a plate of its own so vehicles do not collide. */
async function newRequest(harness: TestApp): Promise<string> {
  plate += 1;
  return seedBookingRequest(harness, {
    customerName: `Kund ${String(plate)}`,
    phone: `070-000 00 ${String(plate).padStart(2, '0')}`,
    regNr: `AAA${String(plate).padStart(2, '0')}A`,
  });
}

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

async function newBooking(
  harness: TestApp,
  agent: Agent,
  body: Record<string, unknown>,
): Promise<string> {
  const requestId = await newRequest(harness);
  const response = await confirm(harness, agent, requestId, body).expect(201);
  return bookingWithRelationsSchema.parse(jsonBody(response)).id;
}

describe('the overlap constraint (B5.4)', () => {
  let harness: TestApp;
  let staff: Agent;
  let mechanic: string;
  let otherMechanic: string;

  beforeAll(async () => {
    harness = await createTestApp();
    staff = await loginAs(harness, { role: 'ADMIN' });
    mechanic = (await seedUser(harness, { name: 'Mekaniker A' })).id;
    otherMechanic = (await seedUser(harness, { name: 'Mekaniker B' })).id;
  });

  afterAll(async () => {
    await harness.close();
  });

  const morning = {
    startsAt: '2026-04-14T08:00:00.000Z',
    endsAt: '2026-04-14T10:00:00.000Z',
  };

  it('allows two adjacent bookings for one mechanic (B5.4.6)', async () => {
    // The range is half-open, `[)`: a job ending at 10:00 and one starting at
    // 10:00 are adjacent, which is how a workshop books a day.
    await newBooking(harness, staff, {
      ...morning,
      assignedUserId: mechanic,
    });
    await newBooking(harness, staff, {
      startsAt: morning.endsAt,
      endsAt: '2026-04-14T12:00:00.000Z',
      assignedUserId: mechanic,
    });
  });

  it('refuses an overlap for the same mechanic with a 409 (B5.4.5)', async () => {
    await newBooking(harness, staff, {
      startsAt: '2026-04-15T08:00:00.000Z',
      endsAt: '2026-04-15T10:00:00.000Z',
      assignedUserId: mechanic,
    });

    const requestId = await newRequest(harness);
    const customersBefore = await harness.app.prisma.customer.count();
    const response = await confirm(harness, staff, requestId, {
      startsAt: '2026-04-15T09:00:00.000Z',
      endsAt: '2026-04-15T11:00:00.000Z',
      assignedUserId: mechanic,
    }).expect(409);

    // Not a 500. The constraint raises SQLSTATE 23P01, and the Prisma code it
    // arrives under differs by path — which is what B0.10.3 exists to prevent
    // being guessed at.
    expect(apiErrorSchema.parse(jsonBody(response)).error.code).toBe(
      'CONFLICT',
    );

    // The whole confirmation rolls back, customer and vehicle included. A
    // rejected slot that still created a customer would quietly fill the
    // register with duplicates of people who never got an appointment.
    const request = await harness.app.prisma.bookingRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: { status: true, booking: { select: { id: true } } },
    });
    expect(request.status).toBe('PENDING');
    expect(request.booking).toBeNull();
    expect(await harness.app.prisma.customer.count()).toBe(customersBefore);
  });

  it('allows the same slot for a different mechanic', async () => {
    await newBooking(harness, staff, {
      startsAt: '2026-04-16T08:00:00.000Z',
      endsAt: '2026-04-16T10:00:00.000Z',
      assignedUserId: mechanic,
    });
    await newBooking(harness, staff, {
      startsAt: '2026-04-16T08:00:00.000Z',
      endsAt: '2026-04-16T10:00:00.000Z',
      assignedUserId: otherMechanic,
    });
  });

  it('exempts unassigned bookings entirely (B5.4.4, B5.4.6)', async () => {
    const slot = {
      startsAt: '2026-04-17T08:00:00.000Z',
      endsAt: '2026-04-17T10:00:00.000Z',
    };
    await newBooking(harness, staff, slot);
    await newBooking(harness, staff, slot);
  });

  it('frees the slot when a booking is cancelled (B5.4.4)', async () => {
    const slot = {
      startsAt: '2026-04-18T08:00:00.000Z',
      endsAt: '2026-04-18T10:00:00.000Z',
      assignedUserId: mechanic,
    };
    const bookingId = await newBooking(harness, staff, slot);

    await confirm(harness, staff, await newRequest(harness), slot).expect(409);

    await withAgent(
      supertest(harness.app.server).patch(`/api/bookings/${bookingId}`),
      staff,
    )
      .send({ status: 'CANCELLED' })
      .expect(200);

    // A cancelled booking must not block the slot it no longer occupies.
    await confirm(harness, staff, await newRequest(harness), slot).expect(201);
  });

  it('refuses a reschedule onto an occupied slot', async () => {
    const taken = {
      startsAt: '2026-04-20T08:00:00.000Z',
      endsAt: '2026-04-20T10:00:00.000Z',
      assignedUserId: mechanic,
    };
    await newBooking(harness, staff, taken);
    const moving = await newBooking(harness, staff, {
      startsAt: '2026-04-20T13:00:00.000Z',
      endsAt: '2026-04-20T15:00:00.000Z',
      assignedUserId: mechanic,
    });

    // The same constraint, on the other write path. A reschedule that returned
    // 500 here would look like a bug in the calendar rather than a full day.
    const response = await withAgent(
      supertest(harness.app.server).patch(`/api/bookings/${moving}`),
      staff,
    )
      .send({ startsAt: taken.startsAt, endsAt: taken.endsAt })
      .expect(409);
    expect(apiErrorSchema.parse(jsonBody(response)).error.code).toBe(
      'CONFLICT',
    );
  });
});

describe('calendar queries (B5.5)', () => {
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

  function calendar(query: string): supertest.Test {
    return supertest(harness.app.server)
      .get(`/api/bookings?${query}`)
      .set('cookie', staff.cookies.join('; '));
  }

  it('requires a login', async () => {
    await supertest(harness.app.server)
      .get('/api/bookings?from=2026-04-14T00:00:00Z&to=2026-04-15T00:00:00Z')
      .expect(401);
  });

  it('refuses a window longer than 90 days (B5.5.1)', async () => {
    const response = await calendar(
      'from=2026-01-01T00:00:00Z&to=2026-12-31T00:00:00Z',
    ).expect(400);
    expect(apiErrorSchema.parse(jsonBody(response)).error.code).toBe(
      'VALIDATION_FAILED',
    );
  });

  it('refuses a window that runs backwards', async () => {
    await calendar('from=2026-04-15T00:00:00Z&to=2026-04-14T00:00:00Z').expect(
      400,
    );
  });

  it('returns overlapping bookings, not only those starting inside', async () => {
    // A job that began yesterday and runs until noon belongs on today's
    // calendar; a view that hid it would misdescribe the workshop's day.
    const overnight = await newBooking(harness, staff, {
      startsAt: '2026-05-04T20:00:00.000Z',
      endsAt: '2026-05-05T09:00:00.000Z',
      assignedUserId: mechanic,
    });

    const body = calendarResponseSchema.parse(
      jsonBody(
        await calendar(
          'from=2026-05-05T06:00:00Z&to=2026-05-05T18:00:00Z',
        ).expect(200),
      ),
    );
    expect(body.data.map((row) => row.id)).toContain(overnight);
  });

  it('filters by mechanic and carries the relations a cell needs', async () => {
    const other = (await seedUser(harness, { name: 'Någon annan' })).id;
    const mine = await newBooking(harness, staff, {
      startsAt: '2026-05-06T08:00:00.000Z',
      endsAt: '2026-05-06T10:00:00.000Z',
      assignedUserId: mechanic,
    });
    await newBooking(harness, staff, {
      startsAt: '2026-05-06T08:00:00.000Z',
      endsAt: '2026-05-06T10:00:00.000Z',
      assignedUserId: other,
    });

    const body = calendarResponseSchema.parse(
      jsonBody(
        await calendar(
          `from=2026-05-06T00:00:00Z&to=2026-05-07T00:00:00Z&userId=${mechanic}`,
        ).expect(200),
      ),
    );

    expect(body.data.map((row) => row.id)).toEqual([mine]);
    const [row] = body.data;
    expect(row?.assignedUser?.name).toBe('Mekaniker');
    expect(row?.customer.name).toMatch(/^Kund /);
    expect(row?.vehicle?.registrationNumberDisplay).toMatch(/^AAA/);
  });
});

/**
 * B5.5.3, B5.5.4 — Sweden observes DST and the containers run UTC (§3.6).
 *
 * 29 March 2026 is a 23-hour day and 25 October is a 25-hour day. Both tests
 * below fail for an implementation that adds a fixed 24 hours to a day's start
 * or that stores a fixed offset instead of an instant.
 */
describe('daylight saving transitions (B5.5.3, B5.5.4)', () => {
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

  it.each([
    ['the spring transition', '2026-03-29', 23],
    ['the autumn transition', '2026-10-25', 25],
  ])('%s keeps a 09:00 booking at 09:00', async (_name, day, hours) => {
    const startsAt = stockholmWallClockToUtc(`${day}T09:00`).toISOString();
    const endsAt = stockholmWallClockToUtc(`${day}T11:00`).toISOString();

    const bookingId = await newBooking(harness, staff, {
      startsAt,
      endsAt,
      assignedUserId: mechanic,
    });

    const body = calendarResponseSchema.parse(
      jsonBody(
        await supertest(harness.app.server)
          .get(`/api/bookings?from=${startsAt}&to=${startsAt}`)
          .set('cookie', staff.cookies.join('; '))
          .expect(200),
      ),
    );

    const found = body.data.find((row) => row.id === bookingId);
    // Stored as an instant, read back as the wall-clock time the customer was
    // promised — on both sides of a transition.
    expect(stockholmWallClock(new Date(found?.startsAt ?? ''))).toBe(
      `${day}T09:00`,
    );

    // The window the server answered with is the local day, whose real length
    // is 23 or 25 hours. A boundary derived by adding 24 hours loses an hour
    // of bookings twice a year.
    expect(
      (Date.parse(body.to) - Date.parse(body.from)) / (60 * 60 * 1000),
    ).toBe(hours);
    expect(stockholmWallClock(new Date(body.from))).toBe(`${day}T00:00`);
  });

  it('includes a booking in the hour the clocks change', async () => {
    // 02:30 does not exist on 29 March, and 02:30 happens twice on 25 October.
    // Neither may fall out of its own day's window.
    const startsAt = stockholmWallClockToUtc('2026-10-25T02:00').toISOString();
    const bookingId = await newBooking(harness, staff, {
      startsAt,
      endsAt: stockholmWallClockToUtc('2026-10-25T04:00').toISOString(),
      assignedUserId: mechanic,
    });

    const body = calendarResponseSchema.parse(
      jsonBody(
        await supertest(harness.app.server)
          .get(
            '/api/bookings?from=2026-10-25T12:00:00Z&to=2026-10-25T12:00:00Z',
          )
          .set('cookie', staff.cookies.join('; '))
          .expect(200),
      ),
    );
    expect(body.data.map((row) => row.id)).toContain(bookingId);
  });
});

describe('PATCH /api/bookings/:id (B5.5.2)', () => {
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

  function patch(id: string): supertest.Test {
    return withAgent(
      supertest(harness.app.server).patch(`/api/bookings/${id}`),
      staff,
    );
  }

  const slot = {
    startsAt: '2026-06-01T08:00:00.000Z',
    endsAt: '2026-06-01T10:00:00.000Z',
  };

  it('reschedules, reassigns and unassigns through one endpoint', async () => {
    const id = await newBooking(harness, staff, slot);

    const rescheduled = bookingWithRelationsSchema.parse(
      jsonBody(
        await patch(id)
          .send({ startsAt: '2026-06-01T09:00:00.000Z' })
          .expect(200),
      ),
    );
    // Only `startsAt` was sent, so the end must be the one already stored.
    expect(rescheduled.startsAt).toBe('2026-06-01T09:00:00.000Z');
    expect(rescheduled.endsAt).toBe(slot.endsAt);

    const assigned = bookingWithRelationsSchema.parse(
      jsonBody(await patch(id).send({ assignedUserId: mechanic }).expect(200)),
    );
    expect(assigned.assignedUser?.id).toBe(mechanic);

    const unassigned = bookingWithRelationsSchema.parse(
      jsonBody(await patch(id).send({ assignedUserId: null }).expect(200)),
    );
    expect(unassigned.assignedUserId).toBeNull();
  });

  it('refuses a patch that would leave the interval reversed', async () => {
    const id = await newBooking(harness, staff, {
      startsAt: '2026-06-03T08:00:00.000Z',
      endsAt: '2026-06-03T10:00:00.000Z',
    });

    // Only the end moves, and it moves before the stored start — a check
    // against the request body alone would not see this.
    const response = await patch(id)
      .send({ endsAt: '2026-06-03T07:00:00.000Z' })
      .expect(400);
    expect(apiErrorSchema.parse(jsonBody(response)).error.code).toBe(
      'VALIDATION_FAILED',
    );
  });

  it('refuses an unknown mechanic', async () => {
    const id = await newBooking(harness, staff, {
      startsAt: '2026-06-04T08:00:00.000Z',
      endsAt: '2026-06-04T10:00:00.000Z',
    });
    await patch(id)
      .send({ assignedUserId: '00000000-0000-0000-0000-000000000000' })
      .expect(400);
  });

  it('refuses a deactivated mechanic', async () => {
    // A deactivated mechanic left on the calendar keeps occupying slots
    // through the exclusion constraint.
    const leaving = await seedUser(harness, { isActive: false });
    const id = await newBooking(harness, staff, {
      startsAt: '2026-06-05T08:00:00.000Z',
      endsAt: '2026-06-05T10:00:00.000Z',
    });
    await patch(id).send({ assignedUserId: leaving.id }).expect(400);
  });

  it('audits a status change', async () => {
    const id = await newBooking(harness, staff, {
      startsAt: '2026-06-06T08:00:00.000Z',
      endsAt: '2026-06-06T10:00:00.000Z',
    });
    await patch(id).send({ status: 'DONE' }).expect(200);

    const entry = await harness.app.prisma.auditLog.findFirst({
      where: { action: 'booking.updated', entityId: id },
    });
    expect(entry?.afterJson).toMatchObject({ status: 'DONE' });
  });

  it('answers 404 for a booking that does not exist', async () => {
    await patch('00000000-0000-0000-0000-000000000000')
      .send({ status: 'DONE' })
      .expect(404);
  });
});
