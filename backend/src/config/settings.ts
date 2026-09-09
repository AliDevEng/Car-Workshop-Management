import { z } from 'zod';
import {
  openingHoursSchema,
  workshopDetailsSchema,
  workshopOperationalSettingsSchema,
  type OpeningHours,
  type PublicWorkshopInfo,
  type SettingsResponse,
  type WorkshopDetails,
  type WorkshopOperationalSettings,
} from 'shared';
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
    name: 'Verkstaden',
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
  db: Database,
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

export function getWorkshopDetails(db: Database): Promise<WorkshopDetails> {
  return readGroup(
    db,
    SETTING_KEYS.workshop,
    workshopDetailsSchema,
    DEFAULT_WORKSHOP_DETAILS,
  );
}

export function getOpeningHours(db: Database): Promise<OpeningHours> {
  return readGroup(
    db,
    SETTING_KEYS.openingHours,
    openingHoursSchema,
    DEFAULT_OPENING_HOURS,
  );
}

export function getOperationalSettings(
  db: Database,
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

/** `GET /api/settings` — the full view for the admin panel (authenticated). */
export async function getSettings(db: Database): Promise<SettingsResponse> {
  const [workshop, openingHours, operational] = await Promise.all([
    getWorkshopDetails(db),
    getOpeningHours(db),
    getOperationalSettings(db),
  ]);
  return { workshop, openingHours, operational };
}
