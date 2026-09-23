import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  apiErrorSchema,
  bookingWithRelationsSchema,
  normalisePhone,
  vehicleMakeListResponseSchema,
  type VehicleMake,
} from 'shared';
import { createTestApp, type TestApp } from './helpers/app.js';
import { jsonBody } from './helpers/http.js';
import {
  anonymousAgent,
  loginAs,
  seedUser,
  withAgent,
  type Agent,
} from './helpers/auth.js';
import { get, post } from './helpers/work-orders.js';

/**
 * `POST /api/bookings` — a booking taken over the telephone, and the make/model
 * catalogue the dialog picks from (PROJECT_SPEC.md §4.2, §6.2, §8.2).
 *
 * §6.2's "a public submission creates a request, never a booking" governs the
 * public form; the commonest case in this workshop is the telephone, and it
 * had no endpoint at all. These tests are about the two rules that make the
 * new path safe rather than merely present: a returning caller must not become
 * a second customer row, and the slot must still be defended by the exclusion
 * constraint rather than by a read-then-write.
 */

let plateCounter = 0;

/** A unique, valid Swedish plate per test. */
function nextPlate(): string {
  plateCounter += 1;
  const letter = (place: number): string =>
    String.fromCharCode(65 + (Math.floor(plateCounter / place) % 26));
  return `${letter(1)}${letter(26)}${letter(676)}42X`;
}

/** A distinct telephone number per test, so the phone-match tests are isolated. */
function nextPhone(): string {
  return `070-900 ${String(plateCounter).padStart(2, '0')} ${String(
    plateCounter,
  ).padStart(2, '0')}`;
}

const SLOT = {
  startsAt: '2026-05-11T08:00:00.000Z',
  endsAt: '2026-05-11T09:00:00.000Z',
};

/** A different hour per call, so unrelated tests cannot collide on a slot. */
let hour = 6;
function nextSlot(): { startsAt: string; endsAt: string } {
  hour += 1;
  const pad = String(hour).padStart(2, '0');
  return {
    startsAt: `2026-06-02T${pad}:00:00.000Z`,
    endsAt: `2026-06-02T${pad}:30:00.000Z`,
  };
}

let harness: TestApp;
let staff: Agent;
let mechanic: string;

beforeAll(async () => {
  harness = await createTestApp();
  staff = await loginAs(harness, { role: 'ADMIN' });
  mechanic = (await seedUser(harness, { name: 'Telefonmekaniker' })).id;
}, 180_000);

afterAll(async () => {
  await harness.close();
});

describe('the make/model catalogue', () => {
  it('serves the seeded makes with their models', async () => {
    const body = vehicleMakeListResponseSchema.parse(
      jsonBody(await get(harness, staff, '/api/vehicle-makes').expect(200)),
    );

    // Fourteen makes across the two catalogue migrations. A floor rather than
    // an equality, so adding a make is an append and not a test to edit.
    expect(body.data.length).toBeGreaterThanOrEqual(14);

    const volvo = body.data.find((make: VehicleMake) => make.name === 'Volvo');
    expect(volvo).toBeDefined();
    expect(volvo?.models.map((model) => model.name)).toContain('V70');

    // The four added by the follow-up migration, one of which carries an
    // accent — the column is UTF-8 and the value is copied verbatim onto a
    // printed protocol, so it has to survive the round trip intact.
    const names = body.data.map((make: VehicleMake) => make.name);
    expect(names).toEqual(
      expect.arrayContaining(['Peugeot', 'Renault', 'Opel', 'Hyundai']),
    );
    const renault = body.data.find(
      (make: VehicleMake) => make.name === 'Renault',
    );
    expect(renault?.models.map((model) => model.name)).toContain('Mégane');

    // Every make carries its eight models.
    for (const make of body.data) {
      expect(make.models.length).toBeGreaterThanOrEqual(8);
    }

    // The order is the point of `sortOrder`: the picker's first entries have
    // to be the makes the workshop actually sees.
    expect(body.data[0]?.name).toBe('Volvo');
  });

  it('refuses an anonymous reader (§5.3)', async () => {
    // The catalogue serves the admin panel. The public booking form collects
    // nothing about the car beyond a plate (§5.5), so there is nothing here
    // for a stranger.
    await supertest(harness.app.server).get('/api/vehicle-makes').expect(401);
  });
});

describe('creating a booking from a telephone call', () => {
  it('creates customer, vehicle and booking in one call', async () => {
    const registrationNumber = nextPlate();
    const phone = nextPhone();

    const booking = bookingWithRelationsSchema.parse(
      jsonBody(
        await post(harness, staff, '/api/bookings', {
          ...SLOT,
          assignedUserId: mechanic,
          customer: { mode: 'NEW', name: 'Karin Nilsson', phone },
          vehicle: {
            mode: 'NEW',
            registrationNumber,
            make: 'Volvo',
            model: 'V70',
            modelYear: 2014,
          },
          note: 'Ringde in, ovanligt ljud fram höger.',
        }).expect(201),
      ),
    );

    expect(booking.status).toBe('SCHEDULED');
    // No request was invented to describe a phone call: the inbox counts what
    // arrived from the website, and a fabricated row would make it meaningless.
    expect(booking.bookingRequestId).toBeNull();
    expect(booking.customer.name).toBe('Karin Nilsson');
    expect(booking.vehicle?.make).toBe('Volvo');
    expect(booking.vehicle?.model).toBe('V70');
    expect(booking.assignedUser?.id).toBe(mechanic);

    const created = await harness.app.prisma.customer.findMany({
      where: { phoneNormalised: normalisePhone(phone) },
    });
    expect(created).toHaveLength(1);
  });

  it('books a caller in with no car at all', async () => {
    // The minimum §4.2 permits: `Booking.customerId` is NOT NULL because the
    // calendar is a promise to a person, but the car may genuinely be unknown
    // when the telephone rings.
    const booking = bookingWithRelationsSchema.parse(
      jsonBody(
        await post(harness, staff, '/api/bookings', {
          ...nextSlot(),
          customer: { mode: 'NEW', name: 'Okänd bil', phone: nextPhone() },
          vehicle: { mode: 'NONE' },
        }).expect(201),
      ),
    );

    expect(booking.vehicle).toBeNull();
    // Unassigned occupies nobody's calendar, and the exclusion constraint is
    // partial on exactly that (B5.4.4).
    expect(booking.assignedUserId).toBeNull();
  });

  it('reuses the customer already on file for that number (§8.2)', async () => {
    const phone = '070-555 11 22';

    await post(harness, staff, '/api/bookings', {
      ...nextSlot(),
      customer: { mode: 'NEW', name: 'Erik Berg', phone },
      vehicle: { mode: 'NONE' },
    }).expect(201);

    const second = bookingWithRelationsSchema.parse(
      jsonBody(
        await post(harness, staff, '/api/bookings', {
          ...nextSlot(),
          // The same person ringing a second time, written down slightly
          // differently. A second row here is how a customer register becomes
          // five copies of the same family.
          customer: { mode: 'NEW', name: 'Erik  Berg', phone: '+46705551122' },
          vehicle: { mode: 'NONE' },
        }).expect(201),
      ),
    );

    const matches = await harness.app.prisma.customer.findMany({
      where: { phoneNormalised: normalisePhone(phone) },
      select: { id: true },
    });
    expect(matches).toHaveLength(1);
    expect(second.customer.id).toBe(matches[0]?.id);
  });

  it('reuses a known plate and fills in the facts it was missing', async () => {
    const registrationNumber = nextPlate();
    // A car the public form created: plate only, make and model unknown.
    const existing = await harness.app.prisma.vehicle.create({
      data: {
        registrationNumber,
        registrationNumberDisplay: registrationNumber,
        make: 'Okänt fabrikat',
        model: 'Okänd modell',
      },
      select: { id: true },
    });

    const booking = bookingWithRelationsSchema.parse(
      jsonBody(
        await post(harness, staff, '/api/bookings', {
          ...nextSlot(),
          customer: { mode: 'NEW', name: 'Sara Lind', phone: nextPhone() },
          vehicle: {
            mode: 'NEW',
            registrationNumber,
            make: 'Toyota',
            model: 'Avensis',
            modelYear: 2011,
          },
        }).expect(201),
      ),
    );

    // The same row, not a second one — the unique index would have refused it
    // anyway, and the service history hangs off the existing car (§6.3).
    expect(booking.vehicle?.id).toBe(existing.id);

    const after = await harness.app.prisma.vehicle.findUniqueOrThrow({
      where: { id: existing.id },
      select: { make: true, model: true, modelYear: true, customerId: true },
    });
    // The placeholders are upgraded; discarding what the staff member just
    // typed would throw away the only real information in the call.
    expect(after.make).toBe('Toyota');
    expect(after.model).toBe('Avensis');
    expect(after.modelYear).toBe(2011);
    // An ownerless car gains the caller as its owner.
    expect(after.customerId).toBe(booking.customerId);
  });

  it('never overwrites a make somebody has already entered', async () => {
    const registrationNumber = nextPlate();
    const existing = await harness.app.prisma.vehicle.create({
      data: {
        registrationNumber,
        registrationNumberDisplay: registrationNumber,
        make: 'Volvo',
        model: 'V60',
        modelYear: 2018,
      },
      select: { id: true },
    });

    await post(harness, staff, '/api/bookings', {
      ...nextSlot(),
      customer: { mode: 'NEW', name: 'Fel märke', phone: nextPhone() },
      vehicle: {
        mode: 'NEW',
        registrationNumber,
        make: 'Saab',
        model: '9-5',
        modelYear: 1999,
      },
    }).expect(201);

    const after = await harness.app.prisma.vehicle.findUniqueOrThrow({
      where: { id: existing.id },
      select: { make: true, model: true, modelYear: true },
    });
    // Correcting a real value is a decision for the vehicle page (§6.3), not
    // a side effect of writing down an appointment.
    expect(after).toEqual({ make: 'Volvo', model: 'V60', modelYear: 2018 });
  });

  it('defaults an unnamed make and model to the placeholders', async () => {
    const registrationNumber = nextPlate();

    const booking = bookingWithRelationsSchema.parse(
      jsonBody(
        await post(harness, staff, '/api/bookings', {
          ...nextSlot(),
          customer: { mode: 'NEW', name: 'Bara regnr', phone: nextPhone() },
          vehicle: { mode: 'NEW', registrationNumber },
        }).expect(201),
      ),
    );

    expect(booking.vehicle?.make).toBe('Okänt fabrikat');
    expect(booking.vehicle?.model).toBe('Okänd modell');
  });

  it('attaches to an existing customer and vehicle when given ids', async () => {
    const customer = await harness.app.prisma.customer.create({
      data: {
        type: 'COMPANY',
        name: 'Bygg & Co AB',
        phone: '08-123 45 67',
        phoneNormalised: '+4681234567',
      },
      select: { id: true },
    });
    const registrationNumber = nextPlate();
    const vehicle = await harness.app.prisma.vehicle.create({
      data: {
        registrationNumber,
        registrationNumberDisplay: registrationNumber,
        customerId: customer.id,
        make: 'Ford',
        model: 'Transit',
      },
      select: { id: true },
    });

    const booking = bookingWithRelationsSchema.parse(
      jsonBody(
        await post(harness, staff, '/api/bookings', {
          ...nextSlot(),
          customer: { mode: 'EXISTING', customerId: customer.id },
          vehicle: { mode: 'EXISTING', vehicleId: vehicle.id },
        }).expect(201),
      ),
    );

    expect(booking.customer.id).toBe(customer.id);
    expect(booking.vehicle?.id).toBe(vehicle.id);
  });

  it('audits the booking as booking.created, exactly as confirmation does', async () => {
    const booking = bookingWithRelationsSchema.parse(
      jsonBody(
        await post(harness, staff, '/api/bookings', {
          ...nextSlot(),
          customer: { mode: 'NEW', name: 'Reviderad', phone: nextPhone() },
          vehicle: { mode: 'NONE' },
        }).expect(201),
      ),
    );

    const entry = await harness.app.prisma.auditLog.findFirst({
      where: { action: 'booking.created', entityId: booking.id },
    });
    expect(entry).not.toBeNull();
    expect(entry?.userId).toBe(staff.userId);
  });
});

describe('what the endpoint refuses', () => {
  it('answers 409 when the slot is taken, from the constraint (§6.2)', async () => {
    const slot = {
      startsAt: '2026-05-20T08:00:00.000Z',
      endsAt: '2026-05-20T10:00:00.000Z',
    };
    await post(harness, staff, '/api/bookings', {
      ...slot,
      assignedUserId: mechanic,
      customer: { mode: 'NEW', name: 'Först', phone: nextPhone() },
      vehicle: { mode: 'NONE' },
    }).expect(201);

    const customersBefore = await harness.app.prisma.customer.count();
    const response = await post(harness, staff, '/api/bookings', {
      startsAt: '2026-05-20T09:00:00.000Z',
      endsAt: '2026-05-20T11:00:00.000Z',
      assignedUserId: mechanic,
      customer: { mode: 'NEW', name: 'Sedan', phone: nextPhone() },
      vehicle: { mode: 'NONE' },
    }).expect(409);

    expect(apiErrorSchema.parse(jsonBody(response)).error.code).toBe(
      'CONFLICT',
    );
    // The whole thing rolls back. A refused slot that still created a customer
    // would quietly fill the register with people who never got a time.
    expect(await harness.app.prisma.customer.count()).toBe(customersBefore);
  });

  it('refuses an interval that runs backwards', async () => {
    await post(harness, staff, '/api/bookings', {
      startsAt: '2026-05-21T10:00:00.000Z',
      endsAt: '2026-05-21T09:00:00.000Z',
      customer: { mode: 'NEW', name: 'Bakvänd', phone: nextPhone() },
      vehicle: { mode: 'NONE' },
    }).expect(400);
  });

  it('refuses a registration number it cannot normalise', async () => {
    // Unlike confirmation, which treats a stranger's typo as "no car" so the
    // request stays confirmable: here the typo is the staff member's own and
    // they are looking at the form.
    const response = await post(harness, staff, '/api/bookings', {
      ...nextSlot(),
      customer: { mode: 'NEW', name: 'Trasigt regnr', phone: nextPhone() },
      vehicle: { mode: 'NEW', registrationNumber: '???' },
    }).expect(400);

    const error = apiErrorSchema.parse(jsonBody(response));
    expect(error.error.code).toBe('VALIDATION_FAILED');
  });

  it('refuses a customer id that does not exist', async () => {
    await post(harness, staff, '/api/bookings', {
      ...nextSlot(),
      customer: { mode: 'EXISTING', customerId: crypto.randomUUID() },
      vehicle: { mode: 'NONE' },
    }).expect(400);
  });

  it('refuses a mechanic who is not active', async () => {
    const retired = await seedUser(harness, { isActive: false });
    await post(harness, staff, '/api/bookings', {
      ...nextSlot(),
      assignedUserId: retired.id,
      customer: { mode: 'NEW', name: 'Fel mekaniker', phone: nextPhone() },
      vehicle: { mode: 'NONE' },
    }).expect(400);
  });

  it('refuses an anonymous caller', async () => {
    // `403`, not `401`: the CSRF preHandler runs before the auth guard and
    // rejects an unsafe request with no token at all (§5.2). Only
    // `POST /api/public/booking-requests` is allow-listed, and this route is
    // deliberately not — which is the assertion worth making here, because a
    // new unsafe route silently landing on that allow-list is the failure
    // mode. The `401` path is covered with a token present below.
    await supertest(harness.app.server)
      .post('/api/bookings')
      .send({
        ...nextSlot(),
        customer: { mode: 'NEW', name: 'Anonym', phone: '070-000 00 00' },
        vehicle: { mode: 'NONE' },
      })
      .expect(403);
  });

  it('refuses a caller who has a CSRF token but no session (§5.3)', async () => {
    const anonymous = await anonymousAgent(harness);
    await withAgent(
      supertest(harness.app.server).post('/api/bookings'),
      anonymous,
    )
      .send({
        ...nextSlot(),
        customer: { mode: 'NEW', name: 'Anonym', phone: '070-000 00 00' },
        vehicle: { mode: 'NONE' },
      })
      .expect(401);
  });
});
