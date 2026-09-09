import { describe, expect, it } from 'vitest';
import { hashIdempotentRequest } from './idempotency.js';

/**
 * B6.6.2 — what an `Idempotency-Key` stands for.
 *
 * The hash decides whether a second request carrying the same key is a retry
 * (replay the stored answer) or a bug (`409`). Both mistakes are expensive:
 * hashing too loosely replays the wrong answer, and hashing too tightly turns
 * an honest retry into a conflict on the one endpoint that must survive a
 * flaky connection.
 */

const ENDPOINT = 'POST /api/work-orders/abc/status';

describe('hashIdempotentRequest', () => {
  it('is stable for the same request', () => {
    const body = { status: 'COMPLETED', version: 3, odometerKmOut: 121_000 };

    expect(hashIdempotentRequest(ENDPOINT, body)).toBe(
      hashIdempotentRequest(ENDPOINT, body),
    );
  });

  it('ignores the order the fields arrived in', () => {
    // `JSON.stringify` preserves insertion order, so without canonicalisation
    // a body whose fields happened to be parsed in a different order would
    // look like a different request — and the tablet's retry would be
    // refused as a key reuse.
    expect(
      hashIdempotentRequest(ENDPOINT, { version: 3, status: 'COMPLETED' }),
    ).toBe(
      hashIdempotentRequest(ENDPOINT, { status: 'COMPLETED', version: 3 }),
    );
  });

  it('treats an absent field and an explicit undefined as the same', () => {
    expect(
      hashIdempotentRequest(ENDPOINT, {
        status: 'COMPLETED',
        odometerKmOut: undefined,
      }),
    ).toBe(hashIdempotentRequest(ENDPOINT, { status: 'COMPLETED' }));
  });

  it('changes when any value changes', () => {
    expect(
      hashIdempotentRequest(ENDPOINT, { status: 'COMPLETED', version: 3 }),
    ).not.toBe(
      hashIdempotentRequest(ENDPOINT, { status: 'COMPLETED', version: 4 }),
    );
  });

  it('changes when the endpoint changes', () => {
    // The same key used on two routes describes two different effects, and
    // replaying one as the other would be worse than refusing.
    const body = { status: 'COMPLETED', version: 3 };

    expect(hashIdempotentRequest(ENDPOINT, body)).not.toBe(
      hashIdempotentRequest('POST /api/work-orders/xyz/status', body),
    );
  });

  it('keeps array order significant', () => {
    // Reordering lines is a different request from not reordering them.
    expect(hashIdempotentRequest(ENDPOINT, { lineIds: ['a', 'b'] })).not.toBe(
      hashIdempotentRequest(ENDPOINT, { lineIds: ['b', 'a'] }),
    );
  });

  it('distinguishes nested values, not only top-level ones', () => {
    expect(
      hashIdempotentRequest(ENDPOINT, { line: { quantity: '4' } }),
    ).not.toBe(hashIdempotentRequest(ENDPOINT, { line: { quantity: '5' } }));
  });
});
