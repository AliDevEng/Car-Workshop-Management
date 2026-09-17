import {
  BOOKING_REQUEST_STATUS_LABELS,
  BOOKING_STATUS_LABELS,
  QUOTE_STATUS_LABELS,
  WORK_ORDER_STATUS_LABELS,
  compareQuantity,
  parseQuantity,
  type BookingRequestStatus,
  type BookingStatus,
  type QuoteStatus,
  type WorkOrderStatus,
} from 'shared';
import { inspectionUrgency } from '@/lib/admin/inspection';

/**
 * The fixed status system (F1.4.3, frontend/README.md "Status colours").
 *
 * §9.2: "Colour in the admin panel is **information**: status is
 * colour-coded and the mapping is fixed system-wide, so a mechanic learns it
 * once." That only holds if there is exactly one place the mapping lives.
 * This is it. A screen that picks `tone="hivis"` for its own reasons has
 * broken the promise for every other screen.
 *
 * Five meanings, and only five:
 */
export const STATUS_MEANINGS = [
  'neutral', // draft, unassigned — nothing is wrong, nothing is happening
  'active', // in progress, scheduled
  'attention', // awaiting parts, due soon, low stock
  'error', // overdue, cancelled, negative stock
  'done', // completed, ready for pickup, accepted
] as const;

export type StatusMeaning = (typeof STATUS_MEANINGS)[number];

/**
 * Each meaning's tone and icon. The icon is not decoration: colour is never
 * the only signal, both for colourblind users and for a tablet held in
 * daylight in a garage doorway (frontend/README.md, §9.6).
 */
export const STATUS_PRESENTATION: Readonly<
  Record<StatusMeaning, { readonly tone: StatusTone; readonly icon: IconName }>
> = {
  neutral: { tone: 'neutral', icon: 'circle-dashed' },
  active: { tone: 'signal', icon: 'circle-dot' },
  attention: { tone: 'hivis', icon: 'triangle-alert' },
  error: { tone: 'oxide', icon: 'circle-x' },
  done: { tone: 'moss', icon: 'circle-check' },
};

export type StatusTone = 'neutral' | 'signal' | 'hivis' | 'oxide' | 'moss';
export type IconName =
  | 'circle-dashed'
  | 'circle-dot'
  | 'triangle-alert'
  | 'circle-x'
  | 'circle-check';

/**
 * Domain status → meaning. Written out per enum rather than inferred from
 * the status name, because the mapping is a product decision:
 * `READY_FOR_PICKUP` is `done` from the workshop's point of view even though
 * the job is not invoiced, and `NO_SHOW` is an `error` even though nothing
 * technically failed.
 *
 * `Record<Status, …>` on each is deliberate — adding a status to `shared`
 * then fails the typecheck here until somebody decides what colour it is,
 * rather than defaulting it to grey silently.
 */
export const WORK_ORDER_STATUS_MEANING: Readonly<
  Record<WorkOrderStatus, StatusMeaning>
> = {
  DRAFT: 'neutral',
  IN_PROGRESS: 'active',
  AWAITING_PARTS: 'attention',
  READY_FOR_PICKUP: 'done',
  COMPLETED: 'done',
  CANCELLED: 'error',
};

export const BOOKING_STATUS_MEANING: Readonly<
  Record<BookingStatus, StatusMeaning>
> = {
  SCHEDULED: 'active',
  IN_PROGRESS: 'active',
  DONE: 'done',
  CANCELLED: 'error',
  NO_SHOW: 'error',
};

export const BOOKING_REQUEST_STATUS_MEANING: Readonly<
  Record<BookingRequestStatus, StatusMeaning>
> = {
  PENDING: 'attention', // an unhandled request is work waiting to be lost
  CONFIRMED: 'done',
  REJECTED: 'neutral',
  SPAM: 'neutral',
};

export const QUOTE_STATUS_MEANING: Readonly<
  Record<QuoteStatus, StatusMeaning>
> = {
  DRAFT: 'neutral',
  SENT: 'active',
  ACCEPTED: 'done',
  DECLINED: 'error',
  EXPIRED: 'attention',
};

/**
 * The label and meaning for one domain status. Overloaded per enum rather
 * than taking a `string`, so a booking status cannot be passed where a work
 * order status is expected and quietly render the wrong Swedish word.
 */
export interface StatusDescriptor {
  readonly label: string;
  readonly meaning: StatusMeaning;
}

export function workOrderStatus(status: WorkOrderStatus): StatusDescriptor {
  return {
    label: WORK_ORDER_STATUS_LABELS[status],
    meaning: WORK_ORDER_STATUS_MEANING[status],
  };
}

export function bookingStatus(status: BookingStatus): StatusDescriptor {
  return {
    label: BOOKING_STATUS_LABELS[status],
    meaning: BOOKING_STATUS_MEANING[status],
  };
}

export function bookingRequestStatus(
  status: BookingRequestStatus,
): StatusDescriptor {
  return {
    label: BOOKING_REQUEST_STATUS_LABELS[status],
    meaning: BOOKING_REQUEST_STATUS_MEANING[status],
  };
}

export function quoteStatus(status: QuoteStatus): StatusDescriptor {
  return {
    label: QUOTE_STATUS_LABELS[status],
    meaning: QUOTE_STATUS_MEANING[status],
  };
}

/**
 * A service protocol has no `status` enum of its own (§4.2) — only
 * `finalisedAt`, nullable until §6.7's finalisation. Modelled here rather
 * than inline at each call site, for the same reason every other status is:
 * one place decides what colour "not finalised yet" is.
 */
export function serviceProtocolStatus(
  finalisedAt: string | null,
): StatusDescriptor {
  return finalisedAt === null
    ? { label: 'Utkast', meaning: 'neutral' }
    : { label: 'Finaliserad', meaning: 'done' };
}

/**
 * A vehicle's inspection due date, coloured by the same fixed map (F6.4.3).
 *
 * §9.2's palette table names `hivis` for "overdue inspections" explicitly —
 * not `oxide`, which the rest of this file reserves for `error` (cancelled,
 * negative stock). An overdue inspection is still just a warning here, the
 * same `attention` meaning as "due soon", because the workshop's response to
 * both is the same phone call.
 */
export function inspectionStatus(
  nextInspectionDueDate: string | null,
): StatusDescriptor {
  if (nextInspectionDueDate === null) {
    return { label: 'Ingen uppgift', meaning: 'neutral' };
  }

  const { daysRemaining, overdue, dueSoon } = inspectionUrgency(
    nextInspectionDueDate,
  );

  if (overdue) {
    return {
      label: `Försenad ${String(Math.abs(daysRemaining))} dagar`,
      meaning: 'attention',
    };
  }

  return {
    label: `${String(daysRemaining)} dagar kvar`,
    meaning: dueSoon ? 'attention' : 'neutral',
  };
}

/**
 * An article's cached balance against its minimum (F7.1.4): `error` once
 * stock has gone negative, `attention` below the minimum, `null` otherwise —
 * a healthy row carries no badge at all, the same restraint `EmptyState`
 * applies to a filter with nothing to flag.
 *
 * Compared with `shared`'s `Quantity` arithmetic rather than `Number(...)`:
 * both values are the canonical decimal strings the API carries (§3.4), and
 * CLAUDE.md's ban on floating-point money applies just as much to a stock
 * threshold a mechanic is deciding whether to trust.
 */
export function stockLevelStatus(
  stockQuantity: string,
  minimumQuantity: string,
): StatusDescriptor | null {
  const stock = parseQuantity(stockQuantity);
  if (compareQuantity(stock, parseQuantity('0')) < 0) {
    return { label: 'Negativt saldo', meaning: 'error' };
  }
  if (compareQuantity(stock, parseQuantity(minimumQuantity)) < 0) {
    return { label: 'Under minsta nivå', meaning: 'attention' };
  }
  return null;
}
