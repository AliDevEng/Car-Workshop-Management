import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isPrismaKnownRequestError } from '../src/lib/prisma-errors.js';
import { createTestApp, type TestApp } from './helpers/app.js';

/**
 * `isPrismaKnownRequestError` recognises Prisma's errors structurally rather
 * than with `instanceof`, so that nothing outside `lib/prisma.ts` has to
 * import the generated client (see that file for why).
 *
 * A structural guard is only worth anything if it matches the real object, and
 * a hand-built fake cannot prove that. This test provokes a genuine failure
 * from a real client against a real database.
 */
describe('Prisma error recognition', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('recognises an error thrown by the real client', async () => {
    const error: unknown = await harness.app.prisma
      .$queryRawUnsafe('SELECT * FROM a_table_that_does_not_exist')
      .then(
        () => undefined,
        (thrown: unknown) => thrown,
      );

    expect(error).toBeDefined();
    expect(isPrismaKnownRequestError(error)).toBe(true);
  });

  it('rejects anything that is not one', () => {
    expect(isPrismaKnownRequestError(new Error('plain'))).toBe(false);
    expect(isPrismaKnownRequestError(null)).toBe(false);
    expect(isPrismaKnownRequestError({ name: 'Other', code: 'P2002' })).toBe(
      false,
    );
    // A code that is not Prisma-shaped: Node's own errors use this field too,
    // and `ECONNREFUSED` must not be mistaken for a database constraint.
    expect(
      isPrismaKnownRequestError({
        name: 'PrismaClientKnownRequestError',
        code: 'ECONNREFUSED',
      }),
    ).toBe(false);
  });
});
