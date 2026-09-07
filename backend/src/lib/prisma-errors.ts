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
