import { z } from 'zod';
import { isValidOre } from '../money.js';
import { isValidQuantityString } from '../quantity.js';
import { isNormalisedRegNr } from '../regnr.js';
import {
  ODOMETER_MAX_KM,
  ODOMETER_MIN_KM,
  isValidOdometerKm,
} from '../units.js';

/**
 * The field-level building blocks every domain schema is assembled from.
 *
 * Two rules hold for everything in this file, and they are the reason it
 * exists rather than each domain file spelling its own `z.number().int()`:
 *
 * 1. **No type-changing transform.** `z.input` and `z.output` stay identical,
 *    so one schema can serve a request body and a response body without the
 *    two disagreeing. `fastify-type-provider-zod` types responses from the
 *    output side and encodes against it; a branding transform would make
 *    every response schema demand a branded value the repository does not
 *    have. Branded types (`Ore`, `Quantity`) belong to the domain layer that
 *    does arithmetic — a handler parses, then calls `ore()` or
 *    `parseQuantity()`. `.trim()` is allowed and does normalise the value,
 *    but it maps `string` to `string`, so the invariant holds; a
 *    `shared/tests/schema-io-invariant.test.ts` assertion fails the build if
 *    an entity schema ever breaks it. The one deliberate exception is
 *    query-string coercion, which is input-only by nature and marked as such.
 * 2. **The decision lives in the domain module, not here.** Predicates like
 *    `isValidQuantityString` are pure functions in `shared/src/*.ts` with
 *    enforced 100 % coverage; `src/schemas/**` is excluded from coverage
 *    precisely because it should contain declarations and nothing else.
 *
 * Messages are Swedish: the frontend renders them straight into a form
 * (PROJECT_SPEC.md §3.7).
 */

// --- Identity and bookkeeping ------------------------------------------------

/**
 * An opaque resource identifier. Deliberately not constrained to a specific
 * format — the concrete generator is a database concern, and every schema in
 * `shared/` treats an id as an opaque string.
 */
export const idSchema = z.string().min(1);

/** A reference to another entity, or nothing. Present on optional relations. */
export const optionalIdSchema = idSchema.nullable();

/**
 * A UTC instant, exactly as `Date#toISOString` produces it (§3.6). An offset
 * such as `+02:00` is rejected, so there is one wire format rather than two.
 *
 * A Prisma `Date` fails this, deliberately and loudly — repositories convert
 * before returning, the same rule `Decimal` follows (§8.2). Serialising the
 * object instead would put `{}` in a response.
 */
export const isoDateTimeSchema = z.iso.datetime();

/** A calendar date with no time component — a `date` column, not `timestamptz`. */
export const isoDateSchema = z.iso.date();

/**
 * Local wall-clock time, `HH:MM`. Opening hours are stored this way on purpose:
 * Sweden observes DST, and `07:00Z` means the workshop opens an hour early for
 * half the year (§3.6).
 */
export const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, {
  message: 'Ange tiden som HH:MM, till exempel 08:00.',
});

/** `createdAt`/`updatedAt`, spread into every persisted entity's schema. */
export const timestampFields = {
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
} as const;

/**
 * Document and work-order numbers — `AO-2026-0001`, `OF-2026-0001`,
 * `SP-2026-0001` (§4.4). Assigned by a Postgres sequence on finalisation.
 */
export const documentNumberSchema = z
  .string()
  .regex(/^(AO|OF|SP)-\d{4}-\d{4}$/, {
    message: 'Numret har fel format.',
  });

/** Optimistic-lock counter (§6.5). Guards header fields and status only. */
export const versionSchema = z.number().int().min(0);

/** Explicit display order for a list an admin can rearrange. */
export const sortOrderSchema = z.number().int().min(0);

// --- Money and VAT -----------------------------------------------------------

const oreBase = z.number().int({
  message: 'Beloppet måste anges i hela ören, utan decimaler.',
});

/**
 * A signed amount in integer öre (§3.2). Signed because a rounding difference
 * and a credited line are both legitimately negative.
 */
export const oreSchema = oreBase.refine(isValidOre, {
  message: 'Beloppet är för stort för att hanteras exakt.',
});

/** A price. Negative prices are a data-entry error, not a discount. */
export const nonNegativeOreSchema = oreBase
  .min(0, { message: 'Beloppet kan inte vara negativt.' })
  .refine(isValidOre, {
    message: 'Beloppet är för stort för att hanteras exakt.',
  });

/**
 * VAT rate in basis points — `2500` is 25 % (§3.3). Stored per line so that a
 * future rate change does not rewrite history.
 */
export const vatRateBpsSchema = z
  .number()
  .int({ message: 'Momssatsen anges i baspunkter, till exempel 2500.' })
  .min(0, { message: 'Momssatsen kan inte vara negativ.' })
  .max(10_000, { message: 'Momssatsen kan inte överstiga 100 %.' });

export const VAT_RATE_BPS_STANDARD = 2500;

/** The three line values, in the §3.3 order. Never recomputed from a total. */
export const lineTotalsSchema = z.object({
  netOre: oreSchema,
  vatOre: oreSchema,
  grossOre: oreSchema,
});
export type LineTotalsDto = z.infer<typeof lineTotalsSchema>;

/**
 * A document's totals: the sum of already-rounded line values, plus the
 * display-only öresavrundning that never feeds back into the lines (§3.3).
 *
 * `roundedGrossOre` is `grossOre + roundingOre`, and is sent rather than left
 * to the client because the backend calculates and the browser formats
 * (CLAUDE.md). Two implementations of the same addition is how a printed
 * document and a screen end up one öre apart.
 */
export const documentTotalsSchema = lineTotalsSchema.extend({
  roundingOre: oreSchema,
  roundedGrossOre: oreSchema,
});
export type DocumentTotalsDto = z.infer<typeof documentTotalsSchema>;

// --- Quantities and odometer -------------------------------------------------

/**
 * A `Decimal(12, 3)` quantity crossing the JSON boundary as a string (§3.4).
 * Never a number: `0.1 + 0.2` is the reason the whole `Quantity` type exists.
 */
export const quantityStringSchema = z.string().refine(isValidQuantityString, {
  message: 'Ange ett antal med högst tre decimaler, till exempel 4.250.',
});

/**
 * Kilometres (§3.5). Stored in km, displayed in mil, converted only in
 * `shared/units.ts`.
 */
export const odometerKmSchema = z
  .number()
  .int({ message: 'Mätarställningen anges i hela kilometer.' })
  .refine(isValidOdometerKm, {
    message: `Mätarställningen måste ligga mellan ${String(ODOMETER_MIN_KM)} och ${String(ODOMETER_MAX_KM)} km.`,
  });

// --- Text and contact details ------------------------------------------------

/** A person, company, article or link name. */
export const nameSchema = z
  .string()
  .trim()
  .min(1, { message: 'Namnet får inte vara tomt.' })
  .max(200, { message: 'Namnet är för långt.' });

/** A single-line free-text field — a description, a location, a reason. */
export const shortTextSchema = z.string().trim().min(1).max(500);

/** A multi-line note. Generous, but bounded: an unbounded column is a payload. */
export const noteSchema = z.string().trim().max(4000);

export const emailSchema = z
  .email({ message: 'Ange en giltig e-postadress.' })
  .max(320);

/**
 * A telephone number **as the customer gave it**. Kept deliberately permissive:
 * §8.2 stores the entered form alongside an E.164 `phoneNormalised`, and
 * rejecting `070-123 45 67` at the boundary defeats the point of storing both.
 */
export const phoneSchema = z
  .string()
  .trim()
  .min(6, { message: 'Telefonnumret är för kort.' })
  .max(32, { message: 'Telefonnumret är för långt.' })
  .regex(/^[+()\-. \d]+$/, {
    message: 'Telefonnumret får bara innehålla siffror och + ( ) - .',
  });

/**
 * Swedish organisation number. Accepts the everyday form `556677-8899`, the
 * unhyphenated `5566778899`, and the 12-digit form some registers print
 * (`165566778899`) — a customer copying the number off an invoice should not
 * have to reformat it.
 */
export const orgNumberSchema = z
  .string()
  .trim()
  .regex(/^(\d{2})?\d{6}-?\d{4}$/, {
    message: 'Ange organisationsnumret som 556677-8899.',
  });

// --- Registration numbers ----------------------------------------------------

/**
 * A registration number **as typed** — `abc 12d`, `ABC-123`. The service
 * normalises it; validating the canonical form here would reject the plate the
 * customer is reading off their key ring.
 */
export const registrationNumberInputSchema = z
  .string()
  .trim()
  .min(2, { message: 'Registreringsnumret är för kort.' })
  .max(12, { message: 'Registreringsnumret är för långt.' });

/**
 * The stored, canonical form. This is the invariant that makes the unique
 * index trustworthy: anything reaching the database has been through
 * `normaliseRegNr` and carries only plate characters, so two spellings of one
 * plate cannot both exist and arbitrary text cannot masquerade as one.
 */
export const normalisedRegistrationNumberSchema = z
  .string()
  .refine(isNormalisedRegNr, {
    message: 'Registreringsnumret är inte normaliserat.',
  });

// --- Query-string coercion ---------------------------------------------------

/**
 * The exception to the no-transform rule, and the only one. A query string is
 * input-only, so `z.input !== z.output` costs nothing here.
 *
 * `z.stringbool()` rather than `z.coerce.boolean()`: the latter is
 * `Boolean(value)`, which turns the string `'false'` into `true` — a filter
 * that silently means the opposite of what the URL says.
 */
export const booleanQuerySchema = z.stringbool();

/** A free-text search term. Trimmed, bounded, and never optional-but-empty. */
export const searchQuerySchema = z.string().trim().min(1).max(100);
