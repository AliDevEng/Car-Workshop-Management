import { describe, expect, it } from 'vitest';
import { ConflictError, isDomainError } from '../src/errors.js';
import {
  allowedQuoteTransitions,
  assertQuoteTransition,
  canTransitionQuote,
  isQuoteExpired,
  isTerminalQuoteStatus,
  QUOTE_STATUS_LABELS,
  QUOTE_STATUSES,
  type QuoteStatus,
} from '../src/quote-state.js';

/**
 * B7.3.3 — every ordered pair of quote statuses, against a table written out
 * here by hand. Deriving the expectation from the implementation would assert
 * only that the code equals itself; this fails if the transition map is edited
 * without a deliberate decision, exactly as B1.4.3 does for work orders.
 */
const LEGAL: ReadonlySet<string> = new Set([
  'DRAFT>SENT',

  'SENT>ACCEPTED',
  'SENT>DECLINED',
  'SENT>EXPIRED',
]);

const ALL_PAIRS: readonly (readonly [QuoteStatus, QuoteStatus])[] =
  QUOTE_STATUSES.flatMap((from) =>
    QUOTE_STATUSES.map((to) => [from, to] as const),
  );

describe('canTransitionQuote covers every ordered pair', () => {
  it.each(ALL_PAIRS)('%s → %s', (from, to) => {
    expect(canTransitionQuote(from, to)).toBe(LEGAL.has(`${from}>${to}`));
  });

  it('allows exactly four moves in total', () => {
    expect(
      ALL_PAIRS.filter(([from, to]) => canTransitionQuote(from, to)),
    ).toHaveLength(LEGAL.size);
  });

  it('never allows a status to transition to itself', () => {
    for (const status of QUOTE_STATUSES) {
      expect(canTransitionQuote(status, status)).toBe(false);
    }
  });

  it('never returns a sent quote to draft', () => {
    // §6.6: what the customer received always still exists. A change after
    // sending is a new version, never an edit of the copy they hold.
    expect(canTransitionQuote('SENT', 'DRAFT')).toBe(false);
  });
});

describe('allowedQuoteTransitions and isTerminalQuoteStatus', () => {
  it('lists what a status can do next', () => {
    expect(allowedQuoteTransitions('DRAFT')).toEqual(['SENT']);
    expect(allowedQuoteTransitions('SENT')).toEqual([
      'ACCEPTED',
      'DECLINED',
      'EXPIRED',
    ]);
  });

  it('treats every answer as terminal', () => {
    expect(isTerminalQuoteStatus('DRAFT')).toBe(false);
    expect(isTerminalQuoteStatus('SENT')).toBe(false);
    expect(isTerminalQuoteStatus('ACCEPTED')).toBe(true);
    expect(isTerminalQuoteStatus('DECLINED')).toBe(true);
    expect(isTerminalQuoteStatus('EXPIRED')).toBe(true);
  });
});

describe('assertQuoteTransition', () => {
  it('passes a legal move silently', () => {
    expect(() => {
      assertQuoteTransition('DRAFT', 'SENT');
    }).not.toThrow();
  });

  it('throws a ConflictError naming both statuses in Swedish', () => {
    let thrown: unknown;
    try {
      assertQuoteTransition('ACCEPTED', 'SENT');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ConflictError);
    if (!isDomainError(thrown)) {
      throw new Error('expected a DomainError');
    }
    expect(thrown.statusCode).toBe(409);
    expect(thrown.message).toContain(QUOTE_STATUS_LABELS.ACCEPTED);
    expect(thrown.message).toContain(QUOTE_STATUS_LABELS.SENT);
  });

  it('reports what the quote could do instead', () => {
    try {
      assertQuoteTransition('SENT', 'DRAFT');
    } catch (error) {
      if (!isDomainError(error)) {
        throw new Error('expected a DomainError');
      }
      expect(error.details).toEqual({
        from: 'SENT',
        to: 'DRAFT',
        allowed: ['ACCEPTED', 'DECLINED', 'EXPIRED'],
      });
    }
  });
});

describe('isQuoteExpired', () => {
  it('keeps a quote valid for the whole of its last day', () => {
    expect(isQuoteExpired('2026-09-30', '2026-09-30')).toBe(false);
  });

  it('expires it the following day', () => {
    expect(isQuoteExpired('2026-09-30', '2026-10-01')).toBe(true);
  });

  it('compares across a year boundary', () => {
    expect(isQuoteExpired('2025-12-31', '2026-01-01')).toBe(true);
    expect(isQuoteExpired('2026-01-01', '2025-12-31')).toBe(false);
  });
});

describe('every status has a Swedish label (§9.7)', () => {
  it.each(QUOTE_STATUSES)('%s', (status) => {
    expect(QUOTE_STATUS_LABELS[status]).not.toBe('');
  });
});
