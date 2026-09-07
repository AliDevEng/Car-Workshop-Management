import { describe, expect, it } from 'vitest';
import {
  ConflictError,
  DomainError,
  ForbiddenError,
  INTERNAL_ERROR_CODE,
  INTERNAL_ERROR_MESSAGE,
  isDomainError,
  NotFoundError,
  RateLimitError,
  ServiceUnavailableError,
  UnauthorizedError,
  ValidationError,
} from '../src/errors.js';

/**
 * The hierarchy moved here from the backend in B1.4, because
 * `assertTransition` throws one of these and `shared` cannot import from the
 * backend. The backend's own tests cover how they are mapped onto responses;
 * these cover the contract itself.
 */
describe('the domain error hierarchy', () => {
  const cases = [
    [new ValidationError(), 'VALIDATION_FAILED', 400],
    [new UnauthorizedError(), 'UNAUTHORIZED', 401],
    [new ForbiddenError(), 'FORBIDDEN', 403],
    [new NotFoundError(), 'NOT_FOUND', 404],
    [new ConflictError(), 'CONFLICT', 409],
    [new RateLimitError(), 'RATE_LIMITED', 429],
    [new ServiceUnavailableError(), 'SERVICE_UNAVAILABLE', 503],
  ] as const;

  it.each(cases)('%s carries its code and status', (error, code, status) => {
    expect(error.code).toBe(code);
    expect(error.statusCode).toBe(status);
    expect(isDomainError(error)).toBe(true);
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toBeInstanceOf(Error);
  });

  it.each(cases)('%s has a Swedish default message', (error) => {
    // §3.7: the frontend renders `message` directly, so it is never English.
    expect(error.message.length).toBeGreaterThan(0);
    expect(error.message).toMatch(/[a-zåäö]/i);
    expect(error.message).not.toMatch(/\b(not found|forbidden|invalid)\b/i);
  });

  it('names itself after the concrete subclass', () => {
    expect(new NotFoundError().name).toBe('NotFoundError');
    expect(new ConflictError().name).toBe('ConflictError');
  });

  it('accepts an overriding message and field-level details', () => {
    const error = new ValidationError('Telefonnumret saknas.', {
      details: { field: 'phone' },
    });

    expect(error.message).toBe('Telefonnumret saknas.');
    expect(error.details).toEqual({ field: 'phone' });
  });

  it('leaves details undefined when none are given', () => {
    expect(new NotFoundError().details).toBeUndefined();
  });

  it('keeps the underlying cause for the log line', () => {
    const cause = new Error('ECONNREFUSED');
    const error = new ServiceUnavailableError(undefined, { cause });

    expect(error.cause).toBe(cause);
  });

  it('rejects anything that is not a domain error', () => {
    expect(isDomainError(new Error('plain'))).toBe(false);
    expect(isDomainError(null)).toBe(false);
    expect(isDomainError('NOT_FOUND')).toBe(false);
    expect(isDomainError({ code: 'NOT_FOUND', statusCode: 404 })).toBe(false);
  });

  it('exposes the generic fallback used for anything unexpected', () => {
    expect(INTERNAL_ERROR_CODE).toBe('INTERNAL_ERROR');
    expect(INTERNAL_ERROR_MESSAGE.length).toBeGreaterThan(0);
  });
});
