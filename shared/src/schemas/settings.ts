import { z } from 'zod';
import {
  emailSchema,
  localTimeSchema,
  nameSchema,
  nonNegativeOreSchema,
  orgNumberSchema,
  phoneSchema,
  shortTextSchema,
} from './primitives.js';

/**
 * Workshop settings — PROJECT_SPEC.md §4.2's `Setting` entity and §3.6.
 *
 * The store itself is key/value with typed accessors in
 * `backend/src/config/settings.ts`; no feature code does a raw string lookup.
 * What lives here is the *shape* of each typed value and the public read
 * contract the marketing site renders.
 */

/** `0` is Monday, matching ISO-8601 rather than `Date#getDay`'s Sunday-first. */
export const WEEKDAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_LABELS: Readonly<Record<Weekday, string>> = {
  MONDAY: 'Måndag',
  TUESDAY: 'Tisdag',
  WEDNESDAY: 'Onsdag',
  THURSDAY: 'Torsdag',
  FRIDAY: 'Fredag',
  SATURDAY: 'Lördag',
  SUNDAY: 'Söndag',
};

export const weekdaySchema = z.enum(WEEKDAYS);

/**
 * Opening hours are **local wall-clock times**, never UTC offsets. Sweden
 * observes DST, and storing `07:00Z` means the workshop appears to open an
 * hour early for half the year (§3.6).
 *
 * A closed day carries `null` for both times rather than being absent, so the
 * public page can render "Söndag — stängt" instead of silently omitting a row.
 */
export const openingHoursDaySchema = z
  .object({
    weekday: weekdaySchema,
    opensAt: localTimeSchema.nullable(),
    closesAt: localTimeSchema.nullable(),
  })
  .refine((day) => (day.opensAt === null) === (day.closesAt === null), {
    message: 'Ange både öppnings- och stängningstid, eller ingen av dem.',
    path: ['closesAt'],
  })
  .refine(
    (day) =>
      day.opensAt === null ||
      day.closesAt === null ||
      day.opensAt < day.closesAt,
    {
      message: 'Stängningstiden måste vara efter öppningstiden.',
      path: ['closesAt'],
    },
  );
export type OpeningHoursDay = z.infer<typeof openingHoursDaySchema>;

/** Exactly seven entries, one per weekday, so a day cannot go missing. */
export const openingHoursSchema = z.array(openingHoursDaySchema).length(7);
export type OpeningHours = z.infer<typeof openingHoursSchema>;

/**
 * The workshop's own details. Used on the public site, in PDF headers and in
 * page metadata.
 */
export const workshopDetailsSchema = z.object({
  name: nameSchema,
  orgNumber: orgNumberSchema,
  address: shortTextSchema,
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{3}\s?\d{2}$/, {
      message: 'Ange postnumret som 123 45.',
    }),
  city: nameSchema,
  phone: phoneSchema,
  email: emailSchema,
});
export type WorkshopDetails = z.infer<typeof workshopDetailsSchema>;

/**
 * `GET /api/public/workshop` (B3.5.2). Only fields that are deliberately
 * public: the daily lookup ceilings, the default hourly rate and anything else
 * operational stay behind authentication.
 */
export const publicWorkshopInfoSchema = z.object({
  workshop: workshopDetailsSchema,
  openingHours: openingHoursSchema,
});
export type PublicWorkshopInfo = z.infer<typeof publicWorkshopInfoSchema>;

/**
 * The operational settings, `ADMIN`-only (B9.7). The two vehicle-lookup
 * ceilings are separate on purpose: a shared ceiling lets an attacker exhaust
 * the staff budget and stop the workshop working, turning a cost problem into
 * an outage (§6.1).
 */
export const workshopOperationalSettingsSchema = z.object({
  defaultHourlyRateOre: nonNegativeOreSchema,
  quoteValidityDays: z.number().int().min(1).max(365),
  vehicleLookupDailyLimitStaff: z.number().int().min(0),
  vehicleLookupDailyLimitPublic: z.number().int().min(0),
});
export type WorkshopOperationalSettings = z.infer<
  typeof workshopOperationalSettingsSchema
>;

/**
 * `GET /api/settings` (B3.5.3) — the full settings view for the admin panel.
 * Authenticated rather than public: `operational` carries the lookup ceilings
 * and the default hourly rate, which stay behind a login. Writes are
 * `ADMIN`-only and arrive in B9.7.
 */
export const settingsResponseSchema = z.object({
  workshop: workshopDetailsSchema,
  openingHours: openingHoursSchema,
  operational: workshopOperationalSettingsSchema,
});
export type SettingsResponse = z.infer<typeof settingsResponseSchema>;

export const updateSettingsInputSchema = z
  .object({
    workshop: workshopDetailsSchema,
    openingHours: openingHoursSchema,
    operational: workshopOperationalSettingsSchema,
  })
  .partial();
export type UpdateSettingsInput = z.infer<typeof updateSettingsInputSchema>;
