import {
  formatRegNrForDisplay,
  isNonStandardPlate,
  normalisePhone,
  normaliseRegNr,
  openingHoursSchema,
  workshopDetailsSchema,
} from 'shared';
import { pino } from 'pino';
import { loadDotEnv } from '../src/config/dotenv.js';
import { loadEnv } from '../src/config/env.js';
import {
  DEFAULT_OPERATIONAL_SETTINGS,
  SETTING_KEYS,
} from '../src/config/settings.js';
import { hashPassword } from '../src/lib/password.js';
import { createPrismaClient } from '../src/lib/prisma.js';

/**
 * Development seed data. Wired through `prisma.config.ts#migrations.seed`
 * (Prisma 7 replaced `package.json#prisma.seed`) and always run explicitly —
 * `prisma migrate dev` no longer implies it (B0.4.8).
 *
 * Each iteration adds its own rows: B2 the two staff users, B3 the workshop
 * settings plus a handful of customers and vehicles, B4 articles. Everything
 * upserts on a stable key, so a second run is a no-op rather than an error.
 */

loadDotEnv();
const env = loadEnv();

const logger = pino({ level: env.LOG_LEVEL });

if (env.NODE_ENV === 'production') {
  logger.fatal('Refusing to seed a production database.');
  process.exit(1);
}

/**
 * Development credentials, printed below so they are discoverable without
 * reading this file. They are safe to hard-code precisely because the guard
 * above makes this script refuse to run against production — and because
 * `.env`'s placeholder secrets are rejected there too (B0.6.3).
 */
const SEED_USERS = [
  {
    email: 'admin@verkstaden.se',
    name: 'Anna Andersson',
    role: 'ADMIN',
    password: 'utveckling-admin-2026',
  },
  {
    email: 'mekaniker@verkstaden.se',
    name: 'Björn Bergström',
    role: 'MECHANIC',
    password: 'utveckling-mekaniker-2026',
  },
] as const;

/**
 * Dev-realistic workshop details; production sets its own in B12. Parsed
 * through the same schema the admin write in B9.7 will use, so a bad seed
 * fails here rather than at the first `GET /api/public/workshop`.
 */
const SEED_WORKSHOP = workshopDetailsSchema.parse({
  name: 'Mome Bilservice',
  orgNumber: '556123-4567',
  address: 'Industrivägen 12',
  postalCode: '171 48',
  city: 'Solna',
  phone: '08-120 345 67',
  email: 'info@bilverkstadensolna.se',
});

const SEED_OPENING_HOURS = openingHoursSchema.parse([
  { weekday: 'MONDAY', opensAt: '07:00', closesAt: '17:00' },
  { weekday: 'TUESDAY', opensAt: '07:00', closesAt: '17:00' },
  { weekday: 'WEDNESDAY', opensAt: '07:00', closesAt: '17:00' },
  { weekday: 'THURSDAY', opensAt: '07:00', closesAt: '17:00' },
  { weekday: 'FRIDAY', opensAt: '07:00', closesAt: '16:00' },
  { weekday: 'SATURDAY', opensAt: '09:00', closesAt: '13:00' },
  { weekday: 'SUNDAY', opensAt: null, closesAt: null },
]);

/** Stable ids so a re-run updates rather than duplicates (B3). */
const SEED_CUSTOMERS = [
  {
    id: '01900000-0000-7000-8000-0000000c0001',
    type: 'PRIVATE',
    name: 'Cecilia Karlsson',
    phone: '070-123 45 67',
    email: 'cecilia.karlsson@example.se',
    address: 'Björkstigen 4, 171 52 Solna',
    orgNumber: null,
  },
  {
    id: '01900000-0000-7000-8000-0000000c0002',
    type: 'PRIVATE',
    name: 'David Lindqvist',
    phone: '0733-99 88 77',
    email: null,
    address: null,
    orgNumber: null,
  },
  {
    id: '01900000-0000-7000-8000-0000000c0003',
    type: 'COMPANY',
    name: 'Solna Bud & Frakt AB',
    phone: '08-55 66 77 88',
    email: 'fordon@solnabud.se',
    address: 'Fraktgatan 9, 169 70 Solna',
    orgNumber: '559111-2222',
  },
] as const;

const SEED_VEHICLES = [
  {
    regNr: 'ABC12A',
    customerId: SEED_CUSTOMERS[0].id,
    make: 'Volvo',
    model: 'V70',
    modelYear: 2016,
    fuelType: 'Diesel',
    firstRegistrationDate: '2016-03-14',
    lastInspectionDate: '2025-02-10',
    nextInspectionDueDate: '2026-02-28',
  },
  {
    regNr: 'XYZ789',
    customerId: SEED_CUSTOMERS[0].id,
    make: 'Toyota',
    model: 'Corolla',
    modelYear: 2020,
    fuelType: 'Hybrid',
    firstRegistrationDate: '2020-06-01',
    lastInspectionDate: '2025-06-05',
    nextInspectionDueDate: '2027-06-30',
  },
  {
    regNr: 'DEF45G',
    customerId: SEED_CUSTOMERS[2].id,
    make: 'Volkswagen',
    model: 'Transporter',
    modelYear: 2019,
    fuelType: 'Diesel',
    firstRegistrationDate: '2019-09-20',
    lastInspectionDate: '2025-09-15',
    nextInspectionDueDate: '2026-09-30',
  },
  {
    // A personalised plate with no owner yet — looked up before anyone knows
    // whose car it is (§4.2).
    regNr: 'MINBIL',
    customerId: null,
    make: 'BMW',
    model: '320d',
    modelYear: 2014,
    fuelType: 'Diesel',
    firstRegistrationDate: '2014-05-02',
    lastInspectionDate: null,
    nextInspectionDueDate: null,
  },
] as const;

/**
 * A handful of catalogue rows, upserting on stable ids (B4). Prices are
 * integer öre excluding VAT; quantities are decimal strings. Each article that
 * carries stock also gets one opening `PURCHASE` movement, so the ledger sum
 * matches the cached balance the reconciliation job checks (§8.4) — the same
 * consistency the odometer seed keeps between history and cache.
 * `HANDPAPPER` is seeded below its minimum so the low-stock view has something
 * to show.
 */
const SEED_ARTICLES = [
  {
    id: '01900000-0000-7000-8000-0000000a0001',
    movementId: '01900000-0000-7000-8000-0000000b0001',
    sku: 'OLJA-5W30-1L',
    name: 'Motorolja 5W-30 helsyntet',
    unit: 'LITRE',
    salesPriceOre: 12_900,
    purchasePriceOre: 6_400,
    minimumQuantity: '20',
    openingQuantity: '48.5',
    location: 'A1-03',
    oeNumbers: ['GM 93165557', '5W30-LL'],
  },
  {
    id: '01900000-0000-7000-8000-0000000a0002',
    movementId: '01900000-0000-7000-8000-0000000b0002',
    sku: 'FILTER-OLJA-VOLVO',
    name: 'Oljefilter Volvo 2.0D',
    unit: 'PIECE',
    salesPriceOre: 14_500,
    purchasePriceOre: 7_100,
    minimumQuantity: '8',
    openingQuantity: '12',
    location: 'B2-11',
    oeNumbers: ['31372212'],
  },
  {
    id: '01900000-0000-7000-8000-0000000a0003',
    movementId: '01900000-0000-7000-8000-0000000b0003',
    sku: 'BROMSVATSKA-DOT4',
    name: 'Bromsvätska DOT 4 (1 l)',
    unit: 'PIECE',
    salesPriceOre: 9_900,
    purchasePriceOre: 3_800,
    minimumQuantity: '6',
    openingQuantity: '5',
    location: 'A3-01',
    oeNumbers: [],
  },
  {
    id: '01900000-0000-7000-8000-0000000a0004',
    movementId: '01900000-0000-7000-8000-0000000b0004',
    sku: 'HANDPAPPER',
    name: 'Industritorkrulle',
    unit: 'PIECE',
    salesPriceOre: 21_900,
    purchasePriceOre: 12_500,
    minimumQuantity: '4',
    openingQuantity: '1',
    location: 'Lager',
    oeNumbers: [],
  },
  {
    id: '01900000-0000-7000-8000-0000000a0005',
    movementId: null,
    sku: 'ARBETE-VERKSTAD',
    name: 'Verkstadsarbete',
    unit: 'HOUR',
    salesPriceOre: 65_000,
    purchasePriceOre: null,
    minimumQuantity: '0',
    openingQuantity: '0',
    location: null,
    oeNumbers: [],
  },
] as const;

/** `(vehicleRegNr, id)` so readings upsert rather than pile up on re-run. */
const SEED_ODOMETER_READINGS = [
  {
    id: '01900000-0000-7000-8000-0000000d0001',
    regNr: 'ABC12A',
    km: 142_300,
    readAt: '2025-02-10T09:15:00.000Z',
  },
  {
    id: '01900000-0000-7000-8000-0000000d0002',
    regNr: 'ABC12A',
    km: 151_050,
    readAt: '2026-01-20T13:40:00.000Z',
  },
] as const;

function toDateColumn(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

const prisma = createPrismaClient(env, logger);

try {
  for (const seedUser of SEED_USERS) {
    // Upsert, not create: seeding twice is a normal thing to do while
    // developing, and it must not fail on the unique email.
    await prisma.user.upsert({
      where: { email: seedUser.email },
      update: {},
      create: {
        email: seedUser.email,
        name: seedUser.name,
        role: seedUser.role,
        passwordHash: await hashPassword(seedUser.password),
      },
    });
  }

  await prisma.setting.upsert({
    where: { key: SETTING_KEYS.workshop },
    update: { valueJson: SEED_WORKSHOP },
    create: { key: SETTING_KEYS.workshop, valueJson: SEED_WORKSHOP },
  });
  await prisma.setting.upsert({
    where: { key: SETTING_KEYS.openingHours },
    update: { valueJson: SEED_OPENING_HOURS },
    create: { key: SETTING_KEYS.openingHours, valueJson: SEED_OPENING_HOURS },
  });
  await prisma.setting.upsert({
    where: { key: SETTING_KEYS.operational },
    update: {},
    create: {
      key: SETTING_KEYS.operational,
      valueJson: DEFAULT_OPERATIONAL_SETTINGS,
    },
  });

  for (const customer of SEED_CUSTOMERS) {
    const shared = {
      type: customer.type,
      name: customer.name,
      phone: customer.phone,
      phoneNormalised: normalisePhone(customer.phone),
      email: customer.email,
      address: customer.address,
      orgNumber: customer.orgNumber,
    };
    await prisma.customer.upsert({
      where: { id: customer.id },
      update: shared,
      create: { id: customer.id, ...shared },
    });
  }

  for (const vehicle of SEED_VEHICLES) {
    const registrationNumber = normaliseRegNr(vehicle.regNr);
    const shared = {
      registrationNumberDisplay: formatRegNrForDisplay(vehicle.regNr),
      isNonStandardPlate: isNonStandardPlate(registrationNumber),
      customerId: vehicle.customerId,
      make: vehicle.make,
      model: vehicle.model,
      modelYear: vehicle.modelYear,
      fuelType: vehicle.fuelType,
      firstRegistrationDate:
        vehicle.firstRegistrationDate === null
          ? null
          : toDateColumn(vehicle.firstRegistrationDate),
      lastInspectionDate:
        vehicle.lastInspectionDate === null
          ? null
          : toDateColumn(vehicle.lastInspectionDate),
      nextInspectionDueDate:
        vehicle.nextInspectionDueDate === null
          ? null
          : toDateColumn(vehicle.nextInspectionDueDate),
    };
    await prisma.vehicle.upsert({
      where: { registrationNumber },
      update: shared,
      create: { registrationNumber, ...shared },
    });
  }

  for (const reading of SEED_ODOMETER_READINGS) {
    const vehicle = await prisma.vehicle.findUniqueOrThrow({
      where: { registrationNumber: normaliseRegNr(reading.regNr) },
      select: { id: true },
    });
    const shared = {
      vehicleId: vehicle.id,
      km: reading.km,
      readAt: new Date(reading.readAt),
      source: 'MANUAL',
    } as const;
    await prisma.odometerReading.upsert({
      where: { id: reading.id },
      update: shared,
      create: { id: reading.id, ...shared },
    });
  }

  // Keep the vehicle cache column consistent with the seeded history.
  for (const vehicle of SEED_VEHICLES) {
    const newest = await prisma.odometerReading.findFirst({
      where: { vehicle: { registrationNumber: normaliseRegNr(vehicle.regNr) } },
      orderBy: [{ readAt: 'desc' }, { km: 'desc' }],
      select: { km: true },
    });
    if (newest !== null) {
      await prisma.vehicle.update({
        where: { registrationNumber: normaliseRegNr(vehicle.regNr) },
        data: { lastKnownOdometerKm: newest.km },
      });
    }
  }

  const seedAdmin = await prisma.user.findUniqueOrThrow({
    where: { email: SEED_USERS[0].email },
    select: { id: true },
  });

  for (const article of SEED_ARTICLES) {
    const shared = {
      name: article.name,
      unit: article.unit,
      salesPriceOre: article.salesPriceOre,
      purchasePriceOre: article.purchasePriceOre,
      minimumQuantity: article.minimumQuantity,
      stockQuantity: article.openingQuantity,
      location: article.location,
      oeNumbers: [...article.oeNumbers],
    };
    await prisma.article.upsert({
      where: { id: article.id },
      update: shared,
      create: { id: article.id, sku: article.sku, ...shared },
    });

    if (article.movementId !== null) {
      const movement = {
        articleId: article.id,
        type: 'PURCHASE',
        quantity: article.openingQuantity,
        balanceAfter: article.openingQuantity,
        userId: seedAdmin.id,
        note: 'Ingående lagersaldo (seed)',
        occurredAt: new Date('2026-01-02T08:00:00.000Z'),
      } as const;
      await prisma.stockMovement.upsert({
        where: { id: article.movementId },
        update: movement,
        create: { id: article.movementId, ...movement },
      });
    }
  }

  logger.info(
    {
      users: SEED_USERS.map((user) => `${user.email} / ${user.password}`),
      customers: SEED_CUSTOMERS.length,
      vehicles: SEED_VEHICLES.length,
      articles: SEED_ARTICLES.length,
    },
    'Seed complete — staff, settings, customers, vehicles and articles ready (B2–B4).',
  );
} finally {
  await prisma.$disconnect();
}
