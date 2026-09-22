import {
  formatRegNrForDisplay,
  isNonStandardPlate,
  normalisePhone,
  normaliseRegNr,
} from 'shared';

/**
 * The B13.1 performance dataset, as plain data.
 *
 * Pure functions only — nothing here opens a connection or reads a clock.
 * `seed.ts` does the writing. The split is what makes the shape of the dataset
 * reviewable and its arithmetic testable (`tests/perf-dataset.test.ts`), and it
 * is the same separation §8.2's own layering asks for one level up: generation
 * is domain logic, insertion is I/O.
 *
 * Two properties are deliberate and load-bearing:
 *
 *   * **Deterministic.** One seeded PRNG, no `Math.random`, no `Date.now`. Two
 *     runs produce byte-identical rows, so a plan that changed between two
 *     measurements changed because of an index rather than because the data
 *     moved underneath it.
 *   * **Internally consistent.** A work order's customer owns its vehicle; the
 *     stock ledger's running `balanceAfter` really is the running sum, and the
 *     final balance is what `Article.stockQuantity` is set to. A dataset that
 *     contradicts itself makes the reconciliation job (§8.4) report drift that
 *     is an artefact of the seed, and makes B13.5.3's correctness check
 *     meaningless.
 */

// --- Volumes (B13.1.1) -------------------------------------------------------

export const PERF_VOLUMES = {
  customers: 5_000,
  vehicles: 8_000,
  articles: 2_000,
  workOrders: 20_000,
  stockMovements: 200_000,

  /**
   * Not in B13.1.1's list, and not padding. A work order's totals are computed
   * from its lines on every read (§3.3, B6.3), so 20 000 *empty* orders would
   * measure a query plan that the real endpoint never runs — the list would
   * look fast for the one reason that cannot hold in production.
   */
  linesPerWorkOrder: 3,
  /** The vehicle page's odometer history and sparkline (F6.4). */
  odometerReadingsPerVehicle: 3,
  /** The calendar is a list endpoint too, and B13.2.2 says every one of them. */
  bookings: 3_000,
  /** The staff inbox's own list (§6.2). */
  bookingRequests: 1_000,
} as const;

/** Share of work orders that have been completed and deducted their stock. */
const COMPLETED_SHARE = 0.72;
/** Share of vehicles with no registered owner yet (§4.2 allows it). */
const OWNERLESS_VEHICLE_SHARE = 0.03;

/**
 * The floor for every seeded odometer value. `shared`'s `odometerKmSchema`
 * refuses anything below 1 km, and a work order carrying a value it refuses
 * cannot be serialised into a response at all — so the generator holds itself
 * to the same range the API enforces. A thousand rather than one because a
 * car that has been driven 1 km is not a car in a workshop.
 */
const MIN_SEEDED_ODOMETER_KM = 1_000;

/** The window the dataset is spread over, ending at the reference date. */
const HISTORY_DAYS = 3 * 365;

const MS_PER_DAY = 86_400_000;
const MS_PER_MINUTE = 60_000;

// --- Determinism -------------------------------------------------------------

/**
 * mulberry32. Thirty-two bits of state and no dependency; the requirement here
 * is reproducibility, not statistical quality — nothing about a query plan
 * cares whether the distribution is defensible in a paper.
 */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** An integer in `[min, max]`, both inclusive. */
function intBetween(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

function pick<T>(random: () => number, values: readonly T[]): T {
  const value = values[Math.floor(random() * values.length)];
  if (value === undefined) {
    // Unreachable for a non-empty array, but `noUncheckedIndexedAccess` is on
    // and CLAUDE.md bans the `!` that would otherwise close this.
    throw new Error('pick() called with an empty array');
  }
  return value;
}

const HEX = '0123456789abcdef';

function toHex(byte: number): string {
  return `${HEX[(byte >> 4) & 0xf] ?? '0'}${HEX[byte & 0xf] ?? '0'}`;
}

/**
 * A UUIDv7 for a given instant, monotonic within one millisecond via the
 * 12-bit `rand_a` field used as a counter.
 *
 * Generated rather than left to the column default, because **every list in
 * this codebase paginates on `id DESC` and relies on a UUIDv7 being ordered by
 * creation time** (see `listWorkOrders`). `crypto.randomUUID` is v4: it would
 * produce a dataset whose "newest first" order is random, which is precisely
 * the property the index work in B13.2 is measured against.
 */
export function uuidV7At(
  timestampMs: number,
  sequence: number,
  random: () => number,
): string {
  const bytes: number[] = [];

  // 48-bit big-endian millisecond timestamp.
  for (let shift = 40; shift >= 0; shift -= 8) {
    bytes.push(Math.floor(timestampMs / 2 ** shift) & 0xff);
  }
  // Version 7 in the high nibble, then 12 bits of counter.
  bytes.push(0x70 | ((sequence >> 8) & 0x0f), sequence & 0xff);
  // Variant 0b10, then 62 bits of randomness.
  bytes.push(0x80 | (Math.floor(random() * 0x40) & 0x3f));
  for (let index = 0; index < 7; index += 1) {
    bytes.push(Math.floor(random() * 0x100));
  }

  const hex = bytes.map(toHex).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/**
 * Hands out ids that ascend with their timestamps, keeping one counter per
 * millisecond so two rows created in the same millisecond still order by
 * creation. One instance per table: the counter only has to be unique within
 * the millisecond it is used in.
 */
function createIdFactory(
  random: () => number,
): (timestampMs: number) => string {
  let lastMs = -1;
  let sequence = 0;

  return (timestampMs: number) => {
    if (timestampMs === lastMs) {
      sequence += 1;
    } else {
      lastMs = timestampMs;
      sequence = 0;
    }
    return uuidV7At(timestampMs, sequence & 0x0fff, random);
  };
}

// --- Quantities --------------------------------------------------------------

/**
 * Quantities are held as integer thousandths and formatted at the edge.
 * `Decimal(12, 3)` is the column (§3.4) and the arithmetic below sums tens of
 * thousands of movements — done in floating point, the ledger's running
 * balance would drift away from the sum of its own rows by the end, which is
 * exactly the disagreement the reconciliation job exists to detect.
 */
export type Thousandths = number;

export function toQuantityString(value: Thousandths): string {
  const sign = value < 0 ? '-' : '';
  const absolute = Math.abs(value);
  const whole = Math.floor(absolute / 1000);
  const fraction = String(absolute % 1000).padStart(3, '0');
  return `${sign}${String(whole)}.${fraction}`;
}

// --- Swedish-looking source material ----------------------------------------

const FIRST_NAMES = [
  'Anna',
  'Erik',
  'Maria',
  'Lars',
  'Karin',
  'Johan',
  'Eva',
  'Anders',
  'Sara',
  'Peter',
  'Emma',
  'Nils',
  'Ingrid',
  'Oskar',
  'Linnéa',
  'Gustav',
  'Åsa',
  'Björn',
  'Sofia',
  'Mikael',
] as const;

const LAST_NAMES = [
  'Andersson',
  'Johansson',
  'Karlsson',
  'Nilsson',
  'Eriksson',
  'Larsson',
  'Olsson',
  'Persson',
  'Svensson',
  'Gustafsson',
  'Lindqvist',
  'Bergström',
  'Sandberg',
  'Öberg',
  'Wallin',
  'Åkesson',
] as const;

const COMPANY_SUFFIXES = ['AB', 'HB', 'Entreprenad AB', 'Åkeri AB'] as const;
const COMPANY_STEMS = [
  'Solna Bud',
  'Sundbyberg Frakt',
  'Bromma Service',
  'Kista Transport',
  'Järfälla Bygg',
  'Täby Städ',
  'Nacka Distribution',
  'Huddinge El',
] as const;

const STREETS = [
  'Industrivägen',
  'Björkstigen',
  'Verkstadsgatan',
  'Fraktgatan',
  'Ekvägen',
  'Storgatan',
  'Hamnvägen',
  'Åkervägen',
] as const;

const CITIES = [
  ['171 48', 'Solna'],
  ['172 67', 'Sundbyberg'],
  ['168 67', 'Bromma'],
  ['164 40', 'Kista'],
  ['177 31', 'Järfälla'],
  ['183 30', 'Täby'],
] as const;

const MAKES = [
  ['Volvo', ['V70', 'XC60', 'V60', 'S60', 'XC90']],
  ['Volkswagen', ['Golf', 'Passat', 'Transporter', 'Polo']],
  ['Toyota', ['Corolla', 'Yaris', 'RAV4', 'Auris']],
  ['Audi', ['A4', 'A6', 'Q5']],
  ['BMW', ['320d', '520d', 'X3']],
  ['Ford', ['Focus', 'Transit', 'Kuga']],
  ['Kia', ['Ceed', 'Sportage']],
  ['Skoda', ['Octavia', 'Superb', 'Fabia']],
] as const satisfies readonly (readonly [string, readonly string[]])[];

const FUEL_TYPES = ['Diesel', 'Bensin', 'Hybrid', 'El', 'Etanol'] as const;

/** A–Z without the letters Swedish plates avoid in practice. */
const PLATE_LETTERS = 'ABCDEFGHJKLMNOPRSTUWXYZ';
const PLATE_LAST = 'ABCDEFGHJKLMNOPRSTUWXYZ0123456789';

const ARTICLE_GROUPS = [
  ['OLJA', 'Motorolja', 'LITRE', 8_900, 25_000],
  ['FILTER', 'Oljefilter', 'PIECE', 7_900, 39_000],
  ['BROMS', 'Bromsskiva', 'PIECE', 24_900, 129_000],
  ['BELAGG', 'Bromsbelägg sats', 'KIT', 39_000, 189_000],
  ['TANDST', 'Tändstift', 'PIECE', 4_900, 24_900],
  ['BATTERI', 'Startbatteri', 'PIECE', 89_000, 349_000],
  ['TORKARE', 'Torkarblad', 'PIECE', 9_900, 39_000],
  ['LAMPA', 'Glödlampa', 'PIECE', 3_900, 19_900],
  ['KILREM', 'Kilrem', 'PIECE', 14_900, 69_000],
  ['KYLVATSKA', 'Kylarvätska', 'LITRE', 6_900, 19_900],
] as const satisfies readonly (readonly [
  string,
  string,
  'PIECE' | 'LITRE' | 'HOUR' | 'KIT',
  number,
  number,
])[];

const WORK_DESCRIPTIONS = [
  'Service enligt tillverkarens intervall',
  'Bromsar bak — byte av skivor och belägg',
  'Felsökning motorlampa',
  'Årlig service och oljebyte',
  'Byte av kamrem',
  'Hjulinställning och däckbyte',
  'Luftkonditionering — service och påfyllning',
  'Besiktningsförberedelse',
  'Byte av startbatteri',
  'Avgassystem — byte av bakre ljuddämpare',
] as const;

const LABOUR_DESCRIPTIONS = [
  'Verkstadsarbete',
  'Felsökning',
  'Diagnos och provkörning',
] as const;

// --- Row shapes --------------------------------------------------------------

export type CustomerRow = {
  readonly id: string;
  readonly type: 'PRIVATE' | 'COMPANY';
  readonly name: string;
  readonly orgNumber: string | null;
  readonly email: string | null;
  readonly phone: string;
  readonly phoneNormalised: string;
  readonly address: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type VehicleRow = {
  readonly id: string;
  readonly registrationNumber: string;
  readonly registrationNumberDisplay: string;
  readonly isNonStandardPlate: boolean;
  readonly customerId: string | null;
  readonly make: string;
  readonly model: string;
  readonly modelYear: number;
  readonly fuelType: string;
  readonly firstRegistrationDate: Date;
  readonly lastInspectionDate: Date;
  readonly nextInspectionDueDate: Date;
  readonly lastKnownOdometerKm: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type OdometerReadingRow = {
  readonly id: string;
  readonly vehicleId: string;
  readonly km: number;
  readonly readAt: Date;
  readonly source: 'MANUAL' | 'WORK_ORDER_IN' | 'WORK_ORDER_OUT';
  readonly userId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type ArticleRow = {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly unit: 'PIECE' | 'LITRE' | 'HOUR' | 'KIT';
  readonly salesPriceOre: number;
  readonly purchasePriceOre: number;
  readonly vatRateBps: number;
  readonly minimumQuantity: string;
  readonly location: string;
  readonly oeNumbers: readonly string[];
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type WorkOrderRow = {
  readonly id: string;
  readonly vehicleId: string;
  readonly customerId: string;
  readonly status:
    | 'DRAFT'
    | 'IN_PROGRESS'
    | 'AWAITING_PARTS'
    | 'READY_FOR_PICKUP'
    | 'COMPLETED'
    | 'CANCELLED';
  readonly odometerKmIn: number;
  readonly odometerKmOut: number | null;
  readonly assignedUserId: string;
  readonly description: string;
  readonly completedAt: Date | null;
  readonly completedByUserId: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type WorkOrderLineRow = {
  readonly id: string;
  readonly workOrderId: string;
  readonly sortOrder: number;
  readonly type: 'LABOUR' | 'PART' | 'FEE';
  readonly articleId: string | null;
  readonly description: string;
  readonly quantity: string;
  readonly unit: 'PIECE' | 'LITRE' | 'HOUR' | 'KIT';
  readonly unitPriceOre: number;
  readonly vatRateBps: number;
  readonly stockDeducted: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type StockMovementRow = {
  readonly id: string;
  readonly articleId: string;
  readonly type: 'PURCHASE' | 'CONSUMPTION' | 'ADJUSTMENT' | 'STOCKTAKE';
  readonly quantity: string;
  readonly balanceAfter: string;
  readonly workOrderId: string | null;
  readonly userId: string;
  readonly note: string | null;
  readonly occurredAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type BookingRow = {
  readonly id: string;
  readonly customerId: string;
  readonly vehicleId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly assignedUserId: string;
  readonly status: 'SCHEDULED' | 'DONE' | 'CANCELLED' | 'NO_SHOW';
  readonly note: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type BookingRequestRow = {
  readonly id: string;
  readonly status: 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'SPAM';
  readonly regNr: string;
  readonly customerName: string;
  readonly phone: string;
  readonly email: string | null;
  readonly requestedDate: Date;
  readonly requestedTimeOfDay: 'MORNING' | 'AFTERNOON' | 'ANY';
  readonly serviceTypeIds: readonly string[];
  readonly message: string | null;
  readonly submittedAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

/** Everything the seed writes, generated in one deterministic pass. */
export type PerfDataset = {
  readonly customers: readonly CustomerRow[];
  readonly vehicles: readonly VehicleRow[];
  readonly odometerReadings: readonly OdometerReadingRow[];
  readonly articles: readonly ArticleRow[];
  readonly workOrders: readonly WorkOrderRow[];
  readonly workOrderLines: readonly WorkOrderLineRow[];
  readonly stockMovements: readonly StockMovementRow[];
  readonly bookings: readonly BookingRow[];
  readonly bookingRequests: readonly BookingRequestRow[];
  /** Final ledger balance per article id — what `stockQuantity` is set to. */
  readonly articleBalances: ReadonlyMap<string, string>;
};

/**
 * The same keys as `PERF_VOLUMES`, with the values widened to `number`.
 * `PERF_VOLUMES` is `as const`, so `typeof` it would demand literally 5 000
 * customers and make the whole point of an override impossible.
 */
export type PerfVolumes = {
  readonly [Key in keyof typeof PERF_VOLUMES]: number;
};

export type GenerateOptions = {
  /** The instant the dataset's history ends at. */
  readonly now: Date;
  /** Staff ids the rows point at — `prisma/seed.ts`'s two users. */
  readonly userIds: readonly string[];
  readonly seed?: number;
  /**
   * Row counts, defaulting to B13.1.1's. Overridable so the invariant tests
   * can check the *rules* — a ledger that sums, a plate that is unique, an
   * owner that matches — on a few thousand rows instead of three hundred
   * thousand. At full volume those checks saturated every core and starved
   * `stock-ledger.test.ts`'s fifty parallel connections into a pool timeout,
   * which is a strange way for a dataset generator to break an unrelated
   * concurrency test.
   */
  readonly volumes?: Partial<PerfVolumes>;
};

// --- Generation --------------------------------------------------------------

function dateColumn(value: Date): Date {
  return new Date(`${value.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

function generateCustomers(
  volumes: PerfVolumes,
  random: () => number,
  nextId: (ms: number) => string,
  startMs: number,
): CustomerRow[] {
  const rows: CustomerRow[] = [];

  for (let index = 0; index < volumes.customers; index += 1) {
    // Spread over the whole window so `createdAt` and `id` both ascend.
    const createdMs =
      startMs +
      Math.floor((index / volumes.customers) * HISTORY_DAYS * MS_PER_DAY);
    const isCompany = index % 7 === 0;
    const city = pick(random, CITIES);
    const name = isCompany
      ? `${pick(random, COMPANY_STEMS)} ${pick(random, COMPANY_SUFFIXES)}`
      : `${pick(random, FIRST_NAMES)} ${pick(random, LAST_NAMES)}`;
    // Unique per row by construction: the index is in the subscriber part.
    const phone = `070-${String(1_000_000 + index).slice(0, 3)} ${String(
      10 + (index % 90),
    )} ${String(10 + (Math.floor(index / 90) % 90))}${String(index % 10)}`;

    rows.push({
      id: nextId(createdMs),
      type: isCompany ? 'COMPANY' : 'PRIVATE',
      name,
      orgNumber: isCompany
        ? `55${String(9_000_000 + index).slice(0, 4)}-${String(1000 + (index % 9000))}`
        : null,
      email:
        index % 3 === 0
          ? null
          : `kund${String(index)}@exempel${String(index % 5)}.se`,
      phone,
      phoneNormalised: normalisePhone(phone),
      address: `${pick(random, STREETS)} ${String(1 + (index % 90))}, ${city[0]} ${city[1]}`,
      // A handful of inactive rows, so `isActive` is a filter with something
      // to filter rather than a column with one value in it.
      isActive: index % 50 !== 0,
      createdAt: new Date(createdMs),
      updatedAt: new Date(createdMs),
    });
  }

  return rows;
}

/** `LLLDD X` — the standard format `shared/regnr.ts` recognises. */
function plateFor(index: number): string {
  const last = PLATE_LAST[index % PLATE_LAST.length] ?? '0';
  const digits = String(Math.floor(index / PLATE_LAST.length) % 100).padStart(
    2,
    '0',
  );
  const letterIndex = Math.floor(index / (PLATE_LAST.length * 100));
  const letters = [
    PLATE_LETTERS[letterIndex % PLATE_LETTERS.length] ?? 'A',
    PLATE_LETTERS[
      Math.floor(letterIndex / PLATE_LETTERS.length) % PLATE_LETTERS.length
    ] ?? 'A',
    PLATE_LETTERS[
      Math.floor(letterIndex / (PLATE_LETTERS.length * PLATE_LETTERS.length)) %
        PLATE_LETTERS.length
    ] ?? 'A',
  ].join('');

  return `${letters}${digits}${last}`;
}

function generateVehicles(
  volumes: PerfVolumes,
  random: () => number,
  nextId: (ms: number) => string,
  startMs: number,
  nowMs: number,
  customers: readonly CustomerRow[],
): VehicleRow[] {
  const rows: VehicleRow[] = [];

  for (let index = 0; index < volumes.vehicles; index += 1) {
    const createdMs =
      startMs +
      Math.floor((index / volumes.vehicles) * HISTORY_DAYS * MS_PER_DAY);
    const plate = normaliseRegNr(plateFor(index));
    const [make, models] = pick(random, MAKES);
    const modelYear = intBetween(random, 2006, 2025);
    const owner =
      random() < OWNERLESS_VEHICLE_SHARE
        ? null
        : (customers[index % customers.length] ?? null);

    // Inspections spread across a whole year around "now", so the dashboard's
    // 60-day window selects a realistic slice rather than all or nothing.
    const inspectionOffsetDays = intBetween(random, -300, 300);
    const nextInspection = new Date(nowMs + inspectionOffsetDays * MS_PER_DAY);

    rows.push({
      id: nextId(createdMs),
      registrationNumber: plate,
      registrationNumberDisplay: formatRegNrForDisplay(plate),
      isNonStandardPlate: isNonStandardPlate(plate),
      customerId: owner === null ? null : owner.id,
      make,
      model: pick(random, models),
      modelYear,
      fuelType: pick(random, FUEL_TYPES),
      firstRegistrationDate: dateColumn(
        new Date(Date.UTC(modelYear, index % 12, 1 + (index % 27))),
      ),
      lastInspectionDate: dateColumn(
        new Date(nextInspection.getTime() - 365 * MS_PER_DAY),
      ),
      nextInspectionDueDate: dateColumn(nextInspection),
      lastKnownOdometerKm: 0, // Replaced from the readings below.
      createdAt: new Date(createdMs),
      updatedAt: new Date(createdMs),
    });
  }

  return rows;
}

/**
 * Readings per vehicle, ascending in both km and time — §3.5 tolerates a lower
 * reading than the previous highest, but a dataset full of them would make the
 * service engine's km baseline noise rather than a baseline.
 */
function generateOdometerReadings(
  volumes: PerfVolumes,
  random: () => number,
  nextId: (ms: number) => string,
  nowMs: number,
  vehicles: readonly VehicleRow[],
  userIds: readonly string[],
): { rows: OdometerReadingRow[]; latestKm: Map<string, number> } {
  const rows: OdometerReadingRow[] = [];
  const latestKm = new Map<string, number>();

  for (const vehicle of vehicles) {
    const age = Math.max(1, 2026 - vehicle.modelYear);
    const perYear = intBetween(random, 8_000, 22_000);
    let km = Math.max(1_000, age * perYear - intBetween(random, 0, 40_000));

    for (
      let reading = 0;
      reading < volumes.odometerReadingsPerVehicle;
      reading += 1
    ) {
      const daysAgo =
        (volumes.odometerReadingsPerVehicle - reading) *
        intBetween(random, 120, 240);
      const readAtMs = nowMs - daysAgo * MS_PER_DAY;
      km += intBetween(random, 3_000, 14_000);

      rows.push({
        id: nextId(readAtMs),
        vehicleId: vehicle.id,
        km,
        readAt: new Date(readAtMs),
        source: reading === 0 ? 'MANUAL' : 'WORK_ORDER_OUT',
        userId: pick(random, userIds),
        createdAt: new Date(readAtMs),
        updatedAt: new Date(readAtMs),
      });
      latestKm.set(vehicle.id, km);
    }
  }

  return { rows, latestKm };
}

function generateArticles(
  volumes: PerfVolumes,
  random: () => number,
  nextId: (ms: number) => string,
  startMs: number,
): ArticleRow[] {
  const rows: ArticleRow[] = [];

  for (let index = 0; index < volumes.articles; index += 1) {
    const createdMs = startMs + index * MS_PER_MINUTE;
    const group = ARTICLE_GROUPS[index % ARTICLE_GROUPS.length] ?? [
      'DIV',
      'Diverse',
      'PIECE',
      1_000,
      9_900,
    ];
    const [prefix, label, unit, priceFloor, priceCeiling] = group;
    const salesPriceOre = intBetween(random, priceFloor, priceCeiling);
    const [make] = pick(random, MAKES);

    rows.push({
      id: nextId(createdMs),
      sku: `${prefix}-${String(index).padStart(5, '0')}`,
      name: `${label} ${make} ${String(intBetween(random, 10, 99))}`,
      unit,
      salesPriceOre,
      // Margin, not a second random number: a purchase price above the sales
      // price would make the low-stock and value reports nonsense.
      purchasePriceOre: Math.round(salesPriceOre * 0.55),
      vatRateBps: 2500,
      minimumQuantity: toQuantityString(intBetween(random, 2, 20) * 1000),
      location: `${pick(random, ['A', 'B', 'C', 'D'])}${String(
        intBetween(random, 1, 9),
      )}-${String(intBetween(random, 1, 40)).padStart(2, '0')}`,
      oeNumbers:
        index % 4 === 0
          ? []
          : [`OE${String(1_000_000 + index)}`, `${prefix}${String(index)}`],
      isActive: index % 40 !== 0,
      createdAt: new Date(createdMs),
      updatedAt: new Date(createdMs),
    });
  }

  return rows;
}

/** A part consumed by a completed work order, before balances are known. */
type ConsumptionIntent = {
  readonly articleId: string;
  readonly workOrderId: string;
  readonly quantity: Thousandths;
  readonly occurredAt: Date;
};

function generateWorkOrders(
  volumes: PerfVolumes,
  random: () => number,
  nextWorkOrderId: (ms: number) => string,
  nextLineId: (ms: number) => string,
  startMs: number,
  nowMs: number,
  vehicles: readonly VehicleRow[],
  articles: readonly ArticleRow[],
  latestKm: ReadonlyMap<string, number>,
  userIds: readonly string[],
): {
  workOrders: WorkOrderRow[];
  lines: WorkOrderLineRow[];
  consumption: ConsumptionIntent[];
} {
  const workOrders: WorkOrderRow[] = [];
  const lines: WorkOrderLineRow[] = [];
  const consumption: ConsumptionIntent[] = [];

  // Only vehicles with an owner can carry a work order: §4.2 requires both,
  // and inventing a customer for an ownerless car is exactly the fake record
  // the nullable `Vehicle.customerId` exists to avoid.
  const owned = vehicles.filter((vehicle) => vehicle.customerId !== null);

  for (let index = 0; index < volumes.workOrders; index += 1) {
    const createdMs =
      startMs +
      Math.floor((index / volumes.workOrders) * HISTORY_DAYS * MS_PER_DAY);
    const vehicle = owned[index % owned.length];
    if (vehicle === undefined || vehicle.customerId === null) {
      continue;
    }

    const isCompleted = random() < COMPLETED_SHARE;
    // The newest orders are the ones still open — a three-year-old job sitting
    // in `IN_PROGRESS` would be a data artefact, and the work-order list's
    // default view is exactly "active work".
    const isRecent = nowMs - createdMs < 30 * MS_PER_DAY;
    const status = isCompleted
      ? 'COMPLETED'
      : isRecent
        ? pick(random, [
            'DRAFT',
            'IN_PROGRESS',
            'AWAITING_PARTS',
            'READY_FOR_PICKUP',
          ] as const)
        : pick(random, ['COMPLETED', 'CANCELLED'] as const);

    const completedMs = createdMs + intBetween(random, 2, 72) * 3_600_000;
    const completed = status === 'COMPLETED';
    // The reading when the car arrived — below the vehicle's newest reading,
    // but **never below `ODOMETER_MIN_KM`**. The first version subtracted up
    // to 30 000 km from whatever the vehicle knew and went negative on a
    // low-mileage car: 166 of 20 000 orders, and
    // `GET /api/work-orders?status=IN_PROGRESS` answered `500` for them,
    // because the response schema refuses to serialise a value
    // `odometerKmSchema` would have refused on the way in. Bypassing the API
    // to load data does not license bypassing its invariants.
    const odometerKmIn = Math.max(
      MIN_SEEDED_ODOMETER_KM,
      (latestKm.get(vehicle.id) ?? 100_000) - intBetween(random, 0, 30_000),
    );
    const workOrderId = nextWorkOrderId(createdMs);
    const assignedUserId = pick(random, userIds);

    workOrders.push({
      id: workOrderId,
      vehicleId: vehicle.id,
      customerId: vehicle.customerId,
      status,
      odometerKmIn,
      odometerKmOut: completed
        ? odometerKmIn + intBetween(random, 1, 60)
        : null,
      assignedUserId,
      description: pick(random, WORK_DESCRIPTIONS),
      completedAt: completed ? new Date(completedMs) : null,
      completedByUserId: completed ? assignedUserId : null,
      // Every write bumps it (§6.5); a seeded order has had a few.
      version: intBetween(random, 1, 6),
      createdAt: new Date(createdMs),
      updatedAt: new Date(completed ? completedMs : createdMs),
    });

    for (
      let lineIndex = 0;
      lineIndex < volumes.linesPerWorkOrder;
      lineIndex += 1
    ) {
      // One labour line, then parts — the shape of a real job, and what makes
      // the mixed-VAT totals arithmetic (§3.3) run over realistic input.
      const isLabour = lineIndex === 0;
      const article = isLabour
        ? undefined
        : articles[
            (index * volumes.linesPerWorkOrder + lineIndex) % articles.length
          ];
      const quantity = isLabour
        ? intBetween(random, 500, 6_000)
        : intBetween(random, 1_000, 8_000);
      const lineMs = createdMs + lineIndex * 1_000;

      lines.push({
        id: nextLineId(lineMs),
        workOrderId,
        sortOrder: lineIndex,
        type: isLabour ? 'LABOUR' : 'PART',
        articleId: article?.id ?? null,
        // Snapshotted at insert (§4.2) — never joined back to the article.
        description: isLabour
          ? pick(random, LABOUR_DESCRIPTIONS)
          : (article?.name ?? 'Reservdel'),
        quantity: toQuantityString(quantity),
        unit: isLabour ? 'HOUR' : (article?.unit ?? 'PIECE'),
        unitPriceOre: isLabour ? 65_000 : (article?.salesPriceOre ?? 9_900),
        vatRateBps: 2500,
        stockDeducted: completed && article !== undefined,
        createdAt: new Date(lineMs),
        updatedAt: new Date(lineMs),
      });

      if (completed && article !== undefined) {
        consumption.push({
          articleId: article.id,
          workOrderId,
          quantity,
          occurredAt: new Date(completedMs),
        });
      }
    }
  }

  return { workOrders, lines, consumption };
}

/**
 * The stock ledger (B13.1.1's 200 000 rows).
 *
 * The work orders' own consumptions come first and are not negotiable — they
 * are the rows `stockDeducted` claims exist. Purchases and corrections are then
 * woven in around them until the target volume is reached, and the running
 * balance is computed over the merged, chronologically-sorted result. A
 * purchase is forced ahead of any consumption that would drive the balance
 * negative, so no article ends up owing parts it never bought.
 */
function generateStockLedger(
  volumes: PerfVolumes,
  random: () => number,
  nextId: (ms: number) => string,
  startMs: number,
  nowMs: number,
  articles: readonly ArticleRow[],
  consumption: readonly ConsumptionIntent[],
  userIds: readonly string[],
): { rows: StockMovementRow[]; balances: Map<string, string> } {
  type Intent = {
    readonly type: StockMovementRow['type'];
    readonly quantity: Thousandths;
    readonly workOrderId: string | null;
    readonly occurredAt: Date;
  };

  const byArticle = new Map<string, Intent[]>();
  for (const article of articles) {
    byArticle.set(article.id, [
      {
        type: 'PURCHASE',
        quantity: intBetween(random, 40, 200) * 1000,
        workOrderId: null,
        occurredAt: new Date(startMs),
      },
    ]);
  }

  for (const intent of consumption) {
    byArticle.get(intent.articleId)?.push({
      type: 'CONSUMPTION',
      quantity: -intent.quantity,
      workOrderId: intent.workOrderId,
      occurredAt: intent.occurredAt,
    });
  }

  // Pad up to the target with restocks and the occasional correction, spread
  // evenly over the articles so `StockMovement(articleId, occurredAt)` sees a
  // realistic number of rows per article rather than one crowded outlier.
  const placed = articles.length + consumption.length;
  const padding = Math.max(0, volumes.stockMovements - placed);
  const window = nowMs - startMs;

  for (let index = 0; index < padding; index += 1) {
    const article = articles[index % articles.length];
    if (article === undefined) {
      continue;
    }
    const occurredAt = new Date(startMs + Math.floor(random() * window));
    const roll = random();
    const intent: Intent =
      roll < 0.8
        ? {
            type: 'PURCHASE',
            quantity: intBetween(random, 10, 80) * 1000,
            workOrderId: null,
            occurredAt,
          }
        : roll < 0.93
          ? {
              type: 'CONSUMPTION',
              quantity: -intBetween(random, 1, 6) * 1000,
              workOrderId: null,
              occurredAt,
            }
          : {
              type: roll < 0.97 ? 'ADJUSTMENT' : 'STOCKTAKE',
              quantity: intBetween(random, -4, 4) * 1000,
              workOrderId: null,
              occurredAt,
            };
    byArticle.get(article.id)?.push(intent);
  }

  const rows: StockMovementRow[] = [];
  const balances = new Map<string, string>();

  for (const [articleId, intents] of byArticle) {
    intents.sort((left, right) => {
      const difference = left.occurredAt.getTime() - right.occurredAt.getTime();
      // A purchase before a consumption in the same millisecond: the ledger is
      // read chronologically and a tie that ordered the other way would show a
      // balance dipping below zero for no reason a reader could explain.
      return difference === 0 ? right.quantity - left.quantity : difference;
    });

    let balance = 0;
    for (const intent of intents) {
      let { quantity } = intent;
      if (balance + quantity < 0) {
        // Not a silent clamp: a consumption larger than the balance becomes
        // exactly the part of it the shelf could actually supply.
        quantity = -balance;
      }
      balance += quantity;
      const occurredMs = intent.occurredAt.getTime();

      rows.push({
        id: nextId(occurredMs),
        articleId,
        type: intent.type,
        quantity: toQuantityString(quantity),
        balanceAfter: toQuantityString(balance),
        workOrderId: intent.workOrderId,
        userId: pick(random, userIds),
        note: intent.workOrderId === null ? 'Prestandadata (B13)' : null,
        occurredAt: intent.occurredAt,
        createdAt: intent.occurredAt,
        updatedAt: intent.occurredAt,
      });
    }

    balances.set(articleId, toQuantityString(balance));
  }

  return { rows, balances };
}

/**
 * Bookings on a grid, not at random instants.
 *
 * The `EXCLUDE USING gist` constraint (§6.2) rejects two overlapping bookings
 * for one mechanic, so a seed that picked start times at random would fail
 * partway through an insert — and it would be right to. One slot per mechanic
 * per hour of a working day is both conflict-free by construction and the
 * shape the calendar actually reads.
 */
function generateBookings(
  volumes: PerfVolumes,
  random: () => number,
  nextId: (ms: number) => string,
  nowMs: number,
  vehicles: readonly VehicleRow[],
  userIds: readonly string[],
): BookingRow[] {
  const rows: BookingRow[] = [];
  const owned = vehicles.filter((vehicle) => vehicle.customerId !== null);
  const slotsPerDay = 8;
  const firstSlotHour = 7;

  // Centred on today: half history, half ahead, which is what the calendar and
  // the dashboard's "today" card both read.
  //
  // Seven sixths of the days needed, because Sundays are skipped below: sizing
  // the window to the target and *then* skipping a day in seven produced 2 576
  // of the 3 000 rows asked for, which is the kind of quiet shortfall that
  // makes a dataset's own documentation wrong.
  const workingDaysNeeded = Math.ceil(
    volumes.bookings / (slotsPerDay * userIds.length),
  );
  const days = Math.ceil((workingDaysNeeded * 7) / 6) + 1;
  const firstDayMs = nowMs - Math.floor(days / 2) * MS_PER_DAY;

  let created = 0;
  for (let day = 0; day < days && created < volumes.bookings; day += 1) {
    const dayStart = new Date(firstDayMs + day * MS_PER_DAY);
    // Sundays are closed (the seed's opening hours); no bookings on them.
    if (dayStart.getUTCDay() === 0) {
      continue;
    }

    for (
      let slot = 0;
      slot < slotsPerDay && created < volumes.bookings;
      slot += 1
    ) {
      for (const userId of userIds) {
        if (created >= volumes.bookings) {
          break;
        }
        const vehicle = owned[created % owned.length];
        if (vehicle === undefined || vehicle.customerId === null) {
          continue;
        }

        const startsAt = new Date(
          Date.UTC(
            dayStart.getUTCFullYear(),
            dayStart.getUTCMonth(),
            dayStart.getUTCDate(),
            firstSlotHour + slot,
          ),
        );
        const endsAt = new Date(startsAt.getTime() + 55 * MS_PER_MINUTE);
        const createdMs =
          startsAt.getTime() - intBetween(random, 1, 21) * MS_PER_DAY;

        rows.push({
          id: nextId(createdMs),
          customerId: vehicle.customerId,
          vehicleId: vehicle.id,
          startsAt,
          endsAt,
          assignedUserId: userId,
          status:
            startsAt.getTime() < nowMs
              ? pick(random, [
                  'DONE',
                  'DONE',
                  'DONE',
                  'NO_SHOW',
                  'CANCELLED',
                ] as const)
              : 'SCHEDULED',
          note: created % 5 === 0 ? 'Kunden väntar på plats' : null,
          createdAt: new Date(createdMs),
          updatedAt: new Date(createdMs),
        });
        created += 1;
      }
    }
  }

  return rows;
}

function generateBookingRequests(
  volumes: PerfVolumes,
  random: () => number,
  nextId: (ms: number) => string,
  nowMs: number,
  vehicles: readonly VehicleRow[],
): BookingRequestRow[] {
  const rows: BookingRequestRow[] = [];

  for (let index = 0; index < volumes.bookingRequests; index += 1) {
    const submittedMs = nowMs - index * 6 * 3_600_000;
    const vehicle = vehicles[index % vehicles.length];
    const name = `${pick(random, FIRST_NAMES)} ${pick(random, LAST_NAMES)}`;
    const phone = `073-${String(100 + (index % 900))} ${String(10 + (index % 90))} ${String(10 + (index % 80))}`;

    rows.push({
      id: nextId(submittedMs),
      // The inbox reads `PENDING` newest-first; the rest give the status filter
      // and the 90-day retention sweep (§5.5) something real to select.
      status:
        index < 40
          ? 'PENDING'
          : pick(random, [
              'CONFIRMED',
              'CONFIRMED',
              'REJECTED',
              'SPAM',
            ] as const),
      regNr: vehicle?.registrationNumber ?? 'ABC123',
      customerName: name,
      phone,
      email: index % 4 === 0 ? null : `webb${String(index)}@exempel.se`,
      requestedDate: dateColumn(
        new Date(submittedMs + intBetween(random, 2, 20) * MS_PER_DAY),
      ),
      requestedTimeOfDay: pick(random, [
        'MORNING',
        'AFTERNOON',
        'ANY',
      ] as const),
      serviceTypeIds: [pick(random, ['service', 'broms', 'ac', 'besiktning'])],
      message: index % 3 === 0 ? null : 'Det låter från vänster framhjul.',
      submittedAt: new Date(submittedMs),
      createdAt: new Date(submittedMs),
      updatedAt: new Date(submittedMs),
    });
  }

  return rows;
}

/**
 * The whole dataset, in dependency order. One PRNG threaded through every
 * generator, so the result is a pure function of `seed` and `now`.
 */
export function generatePerfDataset(options: GenerateOptions): PerfDataset {
  const random = createRandom(options.seed ?? 20_260_921);
  // B13.1.1's numbers unless a caller asks for fewer (tests do).
  const volumes: PerfVolumes = { ...PERF_VOLUMES, ...options.volumes };
  const nowMs = options.now.getTime();
  const startMs = nowMs - HISTORY_DAYS * MS_PER_DAY;
  const userIds = options.userIds;

  if (userIds.length === 0) {
    throw new Error(
      'The performance dataset needs at least one staff user; run the ' +
        'development seed first.',
    );
  }

  const customers = generateCustomers(
    volumes,
    random,
    createIdFactory(random),
    startMs,
  );
  const vehicles = generateVehicles(
    volumes,
    random,
    createIdFactory(random),
    startMs,
    nowMs,
    customers,
  );
  const readings = generateOdometerReadings(
    volumes,
    random,
    createIdFactory(random),
    nowMs,
    vehicles,
    userIds,
  );
  const articles = generateArticles(
    volumes,
    random,
    createIdFactory(random),
    startMs,
  );
  const work = generateWorkOrders(
    volumes,
    random,
    createIdFactory(random),
    createIdFactory(random),
    startMs,
    nowMs,
    vehicles,
    articles,
    readings.latestKm,
    userIds,
  );
  const ledger = generateStockLedger(
    volumes,
    random,
    createIdFactory(random),
    startMs,
    nowMs,
    articles,
    work.consumption,
    userIds,
  );

  return {
    customers,
    // The cache column mirrors the newest reading (§4.2), so it is written from
    // the readings rather than invented beside them.
    vehicles: vehicles.map((vehicle) => ({
      ...vehicle,
      lastKnownOdometerKm: readings.latestKm.get(vehicle.id) ?? 0,
    })),
    odometerReadings: readings.rows,
    articles,
    workOrders: work.workOrders,
    workOrderLines: work.lines,
    stockMovements: ledger.rows,
    bookings: generateBookings(
      volumes,
      random,
      createIdFactory(random),
      nowMs,
      vehicles,
      userIds,
    ),
    bookingRequests: generateBookingRequests(
      volumes,
      random,
      createIdFactory(random),
      nowMs,
      vehicles,
    ),
    articleBalances: ledger.balances,
  };
}
