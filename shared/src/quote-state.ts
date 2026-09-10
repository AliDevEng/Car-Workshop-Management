import { ConflictError } from './errors.js';

/**
 * The quote status state machine — PROJECT_SPEC.md §4.2 and §6.6 (B7.3.3).
 *
 * Built the same way as `work-order-state.ts`, and for the same reason: one
 * typed transition map in `shared/` rather than `if` statements in the routes,
 * so the API rejects exactly what the UI greys out.
 */

export const QUOTE_STATUSES = [
  'DRAFT',
  'SENT',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

/** Swedish labels for the interface and for error messages (§9.7). */
export const QUOTE_STATUS_LABELS: Readonly<Record<QuoteStatus, string>> = {
  DRAFT: 'Utkast',
  SENT: 'Skickad',
  ACCEPTED: 'Accepterad',
  DECLINED: 'Avböjd',
  EXPIRED: 'Utgången',
};

/**
 * Every legal move. Four decisions are deliberate and written down rather than
 * left to be inferred from the table:
 *
 * 1. **`DRAFT` goes only to `SENT`.** Sending is what writes the `Document`,
 *    assigns the §4.4 number and freezes the quote (§6.6); there is no way to
 *    reach an answer without having sent something the customer can hold.
 * 2. **A `SENT` quote never returns to `DRAFT`.** §6.6 is explicit that what
 *    the customer received always still exists, so a change after sending is a
 *    new version — `reviseQuote` — and not an edit of the record they hold.
 * 3. **The three answers are terminal.** A customer who changes their mind gets
 *    a new quote; rewriting the old one would erase the answer the workshop
 *    acted on.
 * 4. **No status transitions to itself.** A double-tapped *Skicka* is refused
 *    by the state machine rather than by the numbering, which would otherwise
 *    spend a second `OF-` number on the same quote.
 */
const TRANSITIONS: Readonly<Record<QuoteStatus, readonly QuoteStatus[]>> = {
  DRAFT: ['SENT'],
  SENT: ['ACCEPTED', 'DECLINED', 'EXPIRED'],
  ACCEPTED: [],
  DECLINED: [],
  EXPIRED: [],
};

/** The statuses reachable from `from`, for the API and for the UI. */
export function allowedQuoteTransitions(
  from: QuoteStatus,
): readonly QuoteStatus[] {
  return TRANSITIONS[from];
}

export function canTransitionQuote(
  from: QuoteStatus,
  to: QuoteStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

/** No move leaves this status. The quote is finished, one way or another. */
export function isTerminalQuoteStatus(status: QuoteStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/**
 * Throws a `ConflictError` when the move is illegal. `409` is the right answer:
 * the request is well-formed, but the quote is not in a state that allows it.
 *
 * `details.allowed` lets the client show what it *could* do instead, rather
 * than only that it failed.
 */
export function assertQuoteTransition(
  from: QuoteStatus,
  to: QuoteStatus,
): void {
  if (canTransitionQuote(from, to)) {
    return;
  }

  const fromLabel = QUOTE_STATUS_LABELS[from];
  const toLabel = QUOTE_STATUS_LABELS[to];

  throw new ConflictError(
    `Det går inte att ändra offertens status från ${fromLabel} till ${toLabel}.`,
    { details: { from, to, allowed: allowedQuoteTransitions(from) } },
  );
}

/**
 * Whether a `SENT` quote has passed its validity date (§4.2's `validUntil`).
 *
 * A pure predicate taking both dates as `YYYY-MM-DD` strings, because
 * `validUntil` is a calendar date rather than an instant: a quote valid until
 * the 30th is valid for the whole of the 30th in the workshop's own day, and
 * comparing it against a UTC instant would expire it an hour early for half the
 * year. The caller supplies today's Europe/Stockholm date from
 * `shared/time.ts`, which is the one place that conversion lives.
 *
 * Lexicographic comparison is exact for zero-padded ISO dates.
 */
export function isQuoteExpired(
  validUntil: string,
  todayInStockholm: string,
): boolean {
  return validUntil < todayInStockholm;
}
