import type { ApiErrorBody } from 'shared';

/**
 * Thrown by the typed API client for every non-2xx response, a network
 * failure, or a response that fails schema validation. Carries the shape of
 * PROJECT_SPEC.md §3.7 so callers can render `message` directly — it is
 * already Swedish and safe to show a user.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | undefined;

  constructor(body: ApiErrorBody['error']) {
    super(body.message);
    this.name = 'ApiError';
    this.code = body.code;
    this.details = body.details;
    this.requestId = body.requestId;
  }

  /** A network failure or non-JSON response — no server error body exists. */
  static networkFailure(message: string): ApiError {
    return new ApiError({
      code: 'NETWORK_FAILURE',
      message,
      requestId: 'n/a',
    });
  }

  static invalidResponse(message: string): ApiError {
    return new ApiError({
      code: 'INVALID_RESPONSE',
      message,
      requestId: 'n/a',
    });
  }
}
