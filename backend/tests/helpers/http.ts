import type { Response } from 'supertest';

/**
 * The JSON body of a response, as `unknown`.
 *
 * Supertest types `response.body` as `any`, which would let a test assert
 * against a field the API does not return and still pass. Reading the raw
 * `text` instead keeps the value untyped in the honest sense: every caller has
 * to parse it with the schema that is supposed to describe it, which is what
 * makes these contract tests rather than shape guesses.
 */
export function jsonBody(response: Response): unknown {
  if (response.text === '') {
    return undefined;
  }

  const parsed: unknown = JSON.parse(response.text);
  return parsed;
}
