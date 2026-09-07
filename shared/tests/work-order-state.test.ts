import { describe, expect, it } from 'vitest';
import { ConflictError, isDomainError } from '../src/errors.js';
import {
  allowedTransitions,
  assertTransition,
  canTransition,
  isTerminalStatus,
  WORK_ORDER_STATUS_LABELS,
  WORK_ORDER_STATUSES,
  type WorkOrderStatus,
} from '../src/work-order-state.js';

/**
 * B1.4.3 — every ordered pair of statuses, against a table written out here
 * by hand. Deriving the expectation from the implementation would assert only
 * that the code equals itself; this fails if the transition map is edited
 * without a deliberate decision.
 */
const LEGAL: ReadonlySet<string> = new Set([
  'DRAFT>IN_PROGRESS',
  'DRAFT>CANCELLED',

  'IN_PROGRESS>AWAITING_PARTS',
  'IN_PROGRESS>READY_FOR_PICKUP',
  'IN_PROGRESS>COMPLETED',
  'IN_PROGRESS>CANCELLED',

  'AWAITING_PARTS>IN_PROGRESS',
  'AWAITING_PARTS>READY_FOR_PICKUP',
  'AWAITING_PARTS>CANCELLED',

  'READY_FOR_PICKUP>IN_PROGRESS',
  'READY_FOR_PICKUP>COMPLETED',
  'READY_FOR_PICKUP>CANCELLED',

  'COMPLETED>IN_PROGRESS',
]);

const ALL_PAIRS: readonly (readonly [WorkOrderStatus, WorkOrderStatus])[] =
  WORK_ORDER_STATUSES.flatMap((from) =>
    WORK_ORDER_STATUSES.map(
      (to): readonly [WorkOrderStatus, WorkOrderStatus] => [from, to],
    ),
  );

describe('canTransition', () => {
  it('covers all 36 ordered pairs', () => {
    expect(ALL_PAIRS).toHaveLength(
      WORK_ORDER_STATUSES.length * WORK_ORDER_STATUSES.length,
    );
  });

  it.each(ALL_PAIRS)('%s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(LEGAL.has(`${from}>${to}`));
  });

  it('never allows a status to transition to itself', () => {
    for (const status of WORK_ORDER_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });
});

describe('the deliberate decisions in the table', () => {
  it('does not let a draft jump straight to completed', () => {
    // Completion deducts stock and needs an out-odometer and a line (§6.5).
    expect(canTransition('DRAFT', 'COMPLETED')).toBe(false);
  });

  it('reverts a completed order only to in progress', () => {
    // Reverting is what writes the compensating RETURN movements (B6.6.4);
    // cancelling straight from COMPLETED would strand the deducted parts.
    expect(allowedTransitions('COMPLETED')).toEqual(['IN_PROGRESS']);
    expect(canTransition('COMPLETED', 'CANCELLED')).toBe(false);
  });

  it('treats cancelled as terminal', () => {
    expect(allowedTransitions('CANCELLED')).toEqual([]);
    expect(isTerminalStatus('CANCELLED')).toBe(true);
  });

  it('reports every other status as non-terminal', () => {
    for (const status of WORK_ORDER_STATUSES) {
      if (status !== 'CANCELLED') {
        expect(isTerminalStatus(status)).toBe(false);
      }
    }
  });

  it('lets a job waiting for parts go back to in progress', () => {
    expect(canTransition('AWAITING_PARTS', 'IN_PROGRESS')).toBe(true);
  });
});

describe('assertTransition', () => {
  it('passes silently for every legal move', () => {
    for (const [from, to] of ALL_PAIRS) {
      if (LEGAL.has(`${from}>${to}`)) {
        expect(() => {
          assertTransition(from, to);
        }).not.toThrow();
      }
    }
  });

  it('throws a ConflictError for an illegal move', () => {
    expect(() => {
      assertTransition('COMPLETED', 'DRAFT');
    }).toThrow(ConflictError);
  });

  it('maps to 409 through the shared domain hierarchy', () => {
    try {
      assertTransition('CANCELLED', 'IN_PROGRESS');
      expect.unreachable('the transition should have been rejected');
    } catch (error) {
      expect(isDomainError(error)).toBe(true);
      if (!isDomainError(error)) {
        return;
      }
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('CONFLICT');
    }
  });

  it('explains the refusal in Swedish, using the visible status names', () => {
    try {
      assertTransition('COMPLETED', 'DRAFT');
      expect.unreachable('the transition should have been rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      if (!(error instanceof ConflictError)) {
        return;
      }
      expect(error.message).toBe(
        'Det går inte att ändra status från Slutförd till Utkast.',
      );
    }
  });

  it('tells the client what it could do instead', () => {
    try {
      assertTransition('DRAFT', 'COMPLETED');
      expect.unreachable('the transition should have been rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      if (!(error instanceof ConflictError)) {
        return;
      }
      expect(error.details).toEqual({
        from: 'DRAFT',
        to: 'COMPLETED',
        allowed: ['IN_PROGRESS', 'CANCELLED'],
      });
    }
  });
});

describe('Swedish labels', () => {
  it('names every status', () => {
    for (const status of WORK_ORDER_STATUSES) {
      expect(WORK_ORDER_STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });

  it('uses no English in the interface text', () => {
    expect(Object.values(WORK_ORDER_STATUS_LABELS)).toEqual([
      'Utkast',
      'Pågår',
      'Väntar på delar',
      'Klar för upphämtning',
      'Slutförd',
      'Avbruten',
    ]);
  });
});
