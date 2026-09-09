/**
 * Turning a Prisma `Date` into the string a `shared` schema expects.
 *
 * Repositories map before returning, exactly as §8.2 requires of `Decimal`:
 * `isoDateTimeSchema` is `z.iso.datetime()` and `isoDateSchema` is
 * `z.iso.date()`, and handing either the `Date` object straight through
 * serialises it to `{}` or throws. A `timestamptz` column becomes a full
 * instant; a `date` column becomes `YYYY-MM-DD` with no time part.
 */

export function toIsoDateTime(value: Date): string {
  return value.toISOString();
}

export function toIsoDateTimeOrNull(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

export function toIsoDateOrNull(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 10);
}
