import type { z } from 'zod';

/**
 * Turns a `shared` field schema into an {@link InlineField} `validate`
 * function, reused by every detail page that edits a field inline (F6.2.1,
 * F6.4). One conversion in one place, so a schema's Swedish message is what
 * the field actually shows rather than a second copy of it.
 */
export function schemaValidator(schema: z.ZodType<string>) {
  return (value: string): string | undefined => {
    const result = schema.safeParse(value);
    return result.success ? undefined : result.error.issues[0]?.message;
  };
}

/**
 * `modelYearSchema` and `vinSchema` (`shared/schemas/vehicle.ts`) carry no
 * custom Swedish message — nothing in the backend renders their default text
 * to a user, since a value that fails them there becomes a generic §3.7
 * validation error. The inline field needs one anyway.
 */
export function validateModelYear(value: string): string | undefined {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    return 'Ange ett modellår mellan 1900 och 2100.';
  }
  return undefined;
}

export function validateVin(value: string): string | undefined {
  if (value.length < 5 || value.length > 32) {
    return 'Chassinumret ska vara mellan 5 och 32 tecken.';
  }
  return undefined;
}
