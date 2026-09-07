/**
 * The domain error hierarchy (PROJECT_SPEC.md §3.7, backend README B0.7.1).
 *
 * Handlers throw these; they never build an error response inline. One
 * `setErrorHandler` turns them into the single API error envelope.
 *
 * Messages are Swedish because the frontend renders `error.message` directly
 * to the user. Code, identifiers and comments stay English (CLAUDE.md).
 */

export type DomainErrorOptions = {
  /** Field-level information for the client. Ends up in `error.details`. */
  readonly details?: unknown;
  /** The underlying error, kept for the log line only. Never serialised. */
  readonly cause?: unknown;
};

export abstract class DomainError extends Error {
  /** Stable, machine-readable identifier. Part of the API contract. */
  abstract readonly code: string;
  /** HTTP status this error maps to. */
  abstract readonly statusCode: number;

  readonly details: unknown;

  protected constructor(message: string, options: DomainErrorOptions = {}) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = new.target.name;
    this.details = options.details;
  }
}

export class ValidationError extends DomainError {
  override readonly code = 'VALIDATION_FAILED';
  override readonly statusCode = 400;

  constructor(
    message = 'Uppgifterna kunde inte valideras.',
    options?: DomainErrorOptions,
  ) {
    super(message, options);
  }
}

export class UnauthorizedError extends DomainError {
  override readonly code = 'UNAUTHORIZED';
  override readonly statusCode = 401;

  constructor(
    message = 'Du måste logga in för att fortsätta.',
    options?: DomainErrorOptions,
  ) {
    super(message, options);
  }
}

export class ForbiddenError extends DomainError {
  override readonly code = 'FORBIDDEN';
  override readonly statusCode = 403;

  constructor(
    message = 'Du har inte behörighet att göra detta.',
    options?: DomainErrorOptions,
  ) {
    super(message, options);
  }
}

export class NotFoundError extends DomainError {
  override readonly code = 'NOT_FOUND';
  override readonly statusCode = 404;

  constructor(
    message = 'Resursen kunde inte hittas.',
    options?: DomainErrorOptions,
  ) {
    super(message, options);
  }
}

export class ConflictError extends DomainError {
  override readonly code = 'CONFLICT';
  override readonly statusCode = 409;

  constructor(
    message = 'Uppgifterna krockar med något som redan finns.',
    options?: DomainErrorOptions,
  ) {
    super(message, options);
  }
}

export class RateLimitError extends DomainError {
  override readonly code = 'RATE_LIMITED';
  override readonly statusCode = 429;

  constructor(
    message = 'För många försök. Vänta en stund och försök igen.',
    options?: DomainErrorOptions,
  ) {
    super(message, options);
  }
}

/**
 * A dependency the request needs is not reachable. Used by the readiness
 * probe; distinct from an unexpected 500 because it is an expected, transient
 * state that a load balancer is supposed to act on.
 */
export class ServiceUnavailableError extends DomainError {
  override readonly code = 'SERVICE_UNAVAILABLE';
  override readonly statusCode = 503;

  constructor(
    message = 'Tjänsten är tillfälligt otillgänglig. Försök igen om en stund.',
    options?: DomainErrorOptions,
  ) {
    super(message, options);
  }
}

/** The Swedish message returned for anything unexpected (§3.7). */
export const INTERNAL_ERROR_MESSAGE =
  'Ett oväntat fel uppstod. Försök igen, och uppge referensen ovan om felet ' +
  'kvarstår.';

export const INTERNAL_ERROR_CODE = 'INTERNAL_ERROR';

export function isDomainError(value: unknown): value is DomainError {
  return value instanceof DomainError;
}
