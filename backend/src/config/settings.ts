import { z } from 'zod';
import {
  ConflictError,
  openingHoursSchema,
  workshopDetailsSchema,
  workshopOperationalSettingsSchema,
  type OpeningHours,
  type PublicWorkshopInfo,
  type SettingsResponse,
  type UpdateSettingsInput,
  type WorkshopDetails,
  type WorkshopOperationalSettings,
} from 'shared';
import type { Prisma } from '../generated/prisma/client.js';
import { writeAuditLog } from '../lib/audit.js';
import type { Database } from '../lib/prisma.js';

/**
 * Typed accessors for the `Setting` key/value store (PROJECT_SPEC.md §4.2,
 * B3.5).
 *
 * No feature code does a raw string lookup: it calls one of the functions
 * below, which reads the row, validates it against the same `shared` schema
 * the admin write in B9.7 will validate against, and hands back a typed value.
 *
 * A missing key falls back to the built-in default — a fresh install has no
 * rows until the seed or B9.7 writes them, and the public page must still
 * render. A row that is present but does not parse is a corrupted setting and
 * is allowed to throw: it cannot happen through the application, so it means
 * the table was edited by hand.
 */

/** One row per settings group; the value is a JSON blob. */
export const SETTING_KEYS = {
  workshop: 'workshop',
  openingHours: 'opening-hours',
  operational: 'operational',
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

/**
 * Defaults are parsed through their own schema at load time, so a typo here is
 * a failed import rather than a surprise at the first request.
 */
export const DEFAULT_WORKSHOP_DETAILS: WorkshopDetails =
  workshopDetailsSchema.parse({
    name: 'Mome Bilservice',
    orgNumber: '556000-0000',
    address: 'Verkstadsgatan 1',
    postalCode: '111 22',
    city: 'Stockholm',
    phone: '08-000 00 00',
    email: 'info@verkstaden.se',
  });

export const DEFAULT_OPENING_HOURS: OpeningHours = openingHoursSchema.parse([
  { weekday: 'MONDAY', opensAt: '07:00', closesAt: '16:00' },
  { weekday: 'TUESDAY', opensAt: '07:00', closesAt: '16:00' },
  { weekday: 'WEDNESDAY', opensAt: '07:00', closesAt: '16:00' },
  { weekday: 'THURSDAY', opensAt: '07:00', closesAt: '16:00' },
  { weekday: 'FRIDAY', opensAt: '07:00', closesAt: '16:00' },
  { weekday: 'SATURDAY', opensAt: null, closesAt: null },
  { weekday: 'SUNDAY', opensAt: null, closesAt: null },
]);

export const DEFAULT_OPERATIONAL_SETTINGS: WorkshopOperationalSettings =
  workshopOperationalSettingsSchema.parse({
    defaultHourlyRateOre: 65_000,
    quoteValidityDays: 30,
    vehicleLookupDailyLimitStaff: 200,
    vehicleLookupDailyLimitPublic: 100,
  });

async function readGroup<T>(
  db: Database | Prisma.TransactionClient,
  key: SettingKey,
  schema: z.ZodType<T>,
  fallback: T,
): Promise<T> {
  const row = await db.setting.findUnique({
    where: { key },
    select: { valueJson: true },
  });
  if (row === null) {
    return fallback;
  }
  return schema.parse(row.valueJson);
}

export function getWorkshopDetails(
  db: Database | Prisma.TransactionClient,
): Promise<WorkshopDetails> {
  return readGroup(
    db,
    SETTING_KEYS.workshop,
    workshopDetailsSchema,
    DEFAULT_WORKSHOP_DETAILS,
  );
}

export function getOpeningHours(
  db: Database | Prisma.TransactionClient,
): Promise<OpeningHours> {
  return readGroup(
    db,
    SETTING_KEYS.openingHours,
    openingHoursSchema,
    DEFAULT_OPENING_HOURS,
  );
}

export function getOperationalSettings(
  db: Database | Prisma.TransactionClient,
): Promise<WorkshopOperationalSettings> {
  return readGroup(
    db,
    SETTING_KEYS.operational,
    workshopOperationalSettingsSchema,
    DEFAULT_OPERATIONAL_SETTINGS,
  );
}

/** `GET /api/public/workshop` — only the fields that are deliberately public. */
export async function getPublicWorkshopInfo(
  db: Database,
): Promise<PublicWorkshopInfo> {
  const [workshop, openingHours] = await Promise.all([
    getWorkshopDetails(db),
    getOpeningHours(db),
  ]);
  return { workshop, openingHours };
}

/**
 * `GET /api/settings` — the full view for the admin panel (authenticated).
 *
 * Sequential reads, not `Promise.all`: B9.7.1's `updateSettings` calls this
 * with a transaction client, and a Prisma interactive transaction runs on one
 * reserved connection — firing independent queries concurrently over it races
 * on that single connection instead of parallelising, which `pg` logs as a
 * deprecation warning rather than an error. Three cheap key lookups in
 * sequence cost nothing worth trading reliability for.
 */
export async function getSettings(
  db: Database | Prisma.TransactionClient,
): Promise<SettingsResponse> {
  const workshop = await getWorkshopDetails(db);
  const openingHours = await getOpeningHours(db);
  const operational = await getOperationalSettings(db);
  const updatedAt = await readGroupTimestamps(db);
  return { workshop, openingHours, operational, updatedAt };
}

/** The optimistic-lock token per group. `null` where no row exists yet. */
async function readGroupTimestamps(
  db: Database | Prisma.TransactionClient,
): Promise<SettingsResponse['updatedAt']> {
  const rows = await db.setting.findMany({
    where: { key: { in: Object.values(SETTING_KEYS) } },
    select: { key: true, updatedAt: true },
  });
  const byKey = new Map(rows.map((row) => [row.key, row.updatedAt]));
  const read = (key: SettingKey): string | null =>
    byKey.get(key)?.toISOString() ?? null;

  return {
    workshop: read(SETTING_KEYS.workshop),
    openingHours: read(SETTING_KEYS.openingHours),
    operational: read(SETTING_KEYS.operational),
  };
}

/**
 * `PATCH /api/settings`, `ADMIN`-only (B9.7.1, F11.1.4).
 *
 * Each settings group is one row, written as a whole — `updateSettingsInputSchema`
 * already validates a complete `WorkshopDetails`/`OpeningHours`/
 * `WorkshopOperationalSettings` object per group it includes, so there is no
 * partial-row merge to get wrong here, unlike `ServiceRule`'s per-field patch.
 * A group the caller omits is left exactly as it was.
 */
export async function updateSettings(
  db: Database,
  actorId: string,
  ipHash: string | null,
  input: UpdateSettingsInput,
): Promise<SettingsResponse> {
  return db.$transaction(async (tx) => {
    const before = await getSettings(tx);
    const expected = input.expectedUpdatedAt ?? {};

    if (input.workshop !== undefined) {
      await writeGroup(tx, SETTING_KEYS.workshop, actorId, input.workshop, {
        expectedUpdatedAt: expected.workshop,
        label: 'Verkstadens uppgifter',
      });
    }
    if (input.openingHours !== undefined) {
      await writeGroup(
        tx,
        SETTING_KEYS.openingHours,
        actorId,
        input.openingHours,
        {
          expectedUpdatedAt: expected.openingHours,
          label: 'Öppettiderna',
        },
      );
    }
    if (input.operational !== undefined) {
      await writeGroup(tx, SETTING_KEYS.operational, actorId, input.operational, {
        expectedUpdatedAt: expected.operational,
        label: 'Driftsinställningarna',
      });
    }

    const after = await getSettings(tx);

    await writeAuditLog(tx, {
      userId: actorId,
      action: 'settings.updated',
      entityType: 'Setting',
      entityId: 'workshop',
      before,
      after,
      ipHash,
    });

    return after;
  });
}

type WriteGroupOptions = {
  /** What the caller last read for this group, or `undefined` to write blind. */
  readonly expectedUpdatedAt: string | null | undefined;
  /** Names the group in the Swedish conflict message. */
  readonly label: string;
};

/**
 * Writes one group, refusing to overwrite a change the caller never saw.
 *
 * The check is a **compare-and-swap**, not a read-then-write: `updatedAt` goes
 * into the `where` clause and PostgreSQL decides, exactly as `updateWithVersion`
 * puts a work order's `version` there (B6's decision log — "the version is in
 * the `where`, so PostgreSQL decides"). Reading the timestamp first and
 * comparing it in JavaScript would leave the same window open between the read
 * and the write that the whole mechanism exists to close, and the test that
 * caught the original bug would still pass.
 */
async function writeGroup(
  tx: Prisma.TransactionClient,
  key: SettingKey,
  actorId: string,
  value: Prisma.InputJsonValue,
  options: WriteGroupOptions,
): Promise<void> {
  const { expectedUpdatedAt } = options;

  if (expectedUpdatedAt === undefined) {
    await tx.setting.upsert({
      where: { key },
      update: { valueJson: value, updatedByUserId: actorId },
      create: { key, valueJson: value, updatedByUserId: actorId },
    });
    return;
  }

  // The caller read no row at all, so they are claiming this group is still
  // unwritten. `create` fails on the unique key if someone has written it
  // since, which is the same answer by a different route.
  if (expectedUpdatedAt === null) {
    const created = await tx.setting.createMany({
      data: [{ key, valueJson: value, updatedByUserId: actorId }],
      skipDuplicates: true,
    });
    if (created.count === 0) {
      throw settingsConflict(options.label);
    }
    return;
  }

  const updated = await tx.setting.updateMany({
    where: { key, updatedAt: new Date(expectedUpdatedAt) },
    data: { valueJson: value, updatedByUserId: actorId },
  });
  if (updated.count === 0) {
    throw settingsConflict(options.label);
  }
}

function settingsConflict(label: string): ConflictError {
  return new ConflictError(
    `${label} har ändrats av någon annan sedan du öppnade sidan. ` +
      'Ladda om och gör ändringen igen.',
  );
}
