/**
 * Structural recognition of Prisma's known request errors.
 *
 * Deliberately not `instanceof PrismaClientKnownRequestError`. The Prisma 7
 * client is generated into `src/generated/`, which is git-ignored and excluded
 * from the typecheck program; importing it here would drag generated code into
 * every module that handles an error, and an `instanceof` check additionally
 * breaks whenever a second copy of the runtime is loaded. The shape below is
 * part of Prisma's documented error contract and is what we actually depend on.
 */

export type PrismaKnownRequestError = {
  readonly name: string;
  readonly code: string;
  readonly meta?: Record<string, unknown>;
};

const PRISMA_ERROR_CODE = /^P\d{4}$/;

export function isPrismaKnownRequestError(
  value: unknown,
): value is PrismaKnownRequestError {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (!('name' in value) || !('code' in value)) {
    return false;
  }

  const { name, code } = value;
  return (
    name === 'PrismaClientKnownRequestError' &&
    typeof code === 'string' &&
    PRISMA_ERROR_CODE.test(code)
  );
}

/**
 * The PostgreSQL SQLSTATE behind a Prisma error, or `null`.
 *
 * **The Prisma code is not usable for this and B0.10 measured why.** The same
 * booking exclusion-constraint violation surfaces as `P2039` from
 * `prisma.booking.create()` and as `P2010` from a raw insert or from inside an
 * interactive transaction — so a handler keyed on a Prisma code (`P2002` being
 * the obvious guess) never fires, and the caller gets a `500` in production.
 * Both paths nest the driver's own error identically, and the SQLSTATE is
 * stable across them.
 *
 * Read structurally, for the same reason as `isPrismaKnownRequestError`: the
 * generated client is not importable from here, and the shape is the contract.
 */
export function postgresErrorCode(error: unknown): string | null {
  if (!isPrismaKnownRequestError(error)) {
    return null;
  }

  const adapterError: unknown = error.meta?.['driverAdapterError'];
  if (typeof adapterError !== 'object' || adapterError === null) {
    return null;
  }
  if (!('cause' in adapterError)) {
    return null;
  }

  const { cause } = adapterError;
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) {
    return null;
  }

  return typeof cause.code === 'string' ? cause.code : null;
}

/** `exclusion_violation` — the booking overlap constraint (§6.2, B5.4.5). */
export const SQLSTATE_EXCLUSION_VIOLATION = '23P01';

/**
 * The columns Prisma names in `meta.target` for a unique-constraint violation.
 * Returned as `error.details` so the client can point at the offending field.
 */
export function uniqueConstraintFields(
  error: PrismaKnownRequestError,
): readonly string[] {
  const target: unknown = error.meta?.['target'];

  if (Array.isArray(target)) {
    // `Array.isArray` narrows `unknown` to `any[]`, which would put an
    // implicit `any` into the callback below. Re-declaring as `unknown[]`
    // keeps the element type honest.
    const entries: readonly unknown[] = target;
    return entries.filter(
      (entry): entry is string => typeof entry === 'string',
    );
  }
  return typeof target === 'string' ? [target] : [];
}
