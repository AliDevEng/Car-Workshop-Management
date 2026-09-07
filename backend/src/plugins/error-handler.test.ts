import { describe, expect, it } from 'vitest';
import { mapError } from './error-handler.js';
import {
  ConflictError,
  ForbiddenError,
  INTERNAL_ERROR_CODE,
  NotFoundError,
  ValidationError,
} from 'shared';

/**
 * The pure half of B0.7. The route-level shapes are asserted in
 * tests/errors.test.ts; this covers the mappings that only a framework error
 * reaches, which would otherwise rot unnoticed until something in production
 * returned an English 500.
 */

/** Fastify attaches `statusCode` to its own errors; nothing else about them matters. */
function fastifyError(statusCode: number, message = 'boom'): Error {
  return Object.assign(new Error(message), { statusCode });
}

describe('mapError', () => {
  it.each([
    [400, 'VALIDATION_FAILED'],
    [401, 'UNAUTHORIZED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [413, 'PAYLOAD_TOO_LARGE'],
    [415, 'UNSUPPORTED_MEDIA_TYPE'],
    [429, 'RATE_LIMITED'],
    [406, 'BAD_REQUEST'],
  ])('maps a Fastify %i to %s', (statusCode, code) => {
    const mapped = mapError(fastifyError(statusCode));

    expect(mapped.statusCode).toBe(statusCode);
    expect(mapped.code).toBe(code);
    expect(mapped.unexpected).toBe(false);
  });

  it('never reuses a Fastify error message, which is English', () => {
    const mapped = mapError(fastifyError(429, 'Rate limit exceeded'));

    expect(mapped.message).not.toContain('Rate limit');
    expect(mapped.message).toContain('försök');
  });

  it('treats a 5xx from Fastify as unexpected', () => {
    const mapped = mapError(fastifyError(502));

    expect(mapped.statusCode).toBe(500);
    expect(mapped.code).toBe(INTERNAL_ERROR_CODE);
    expect(mapped.unexpected).toBe(true);
  });

  it.each([
    [new ValidationError(), 400],
    [new ForbiddenError(), 403],
    [new NotFoundError(), 404],
    [new ConflictError(), 409],
  ])('carries a domain error through unchanged', (error, statusCode) => {
    const mapped = mapError(error);

    expect(mapped.statusCode).toBe(statusCode);
    expect(mapped.message).toBe(error.message);
  });

  it('passes domain details through to the client', () => {
    const mapped = mapError(
      new ValidationError('Fel', { details: { field: 'phone' } }),
    );

    expect(mapped.details).toEqual({ field: 'phone' });
  });

  it('omits details entirely when there are none', () => {
    expect(mapError(new NotFoundError())).not.toHaveProperty('details');
  });

  it.each([undefined, null, 'a string', 42, { code: 'P2002' }])(
    'falls back to a generic 500 for %s',
    (value) => {
      const mapped = mapError(value);

      expect(mapped.statusCode).toBe(500);
      expect(mapped.code).toBe(INTERNAL_ERROR_CODE);
      expect(mapped.unexpected).toBe(true);
    },
  );

  it('leaves an unmapped Prisma code as an unexpected 500', () => {
    // P2010 is a raw-query failure. Silently turning every Prisma code into a
    // 4xx would hide real defects behind a message that blames the user.
    const error = Object.assign(new Error('raw query failed'), {
      code: 'P2010',
    });
    error.name = 'PrismaClientKnownRequestError';

    expect(mapError(error).statusCode).toBe(500);
  });
});
