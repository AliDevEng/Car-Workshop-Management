'use client';

import { CalendarClockIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useBookingRequests } from '@/lib/api/bookings';
import { cn } from '@/lib/utils';

/**
 * F8.1.5 — the unhandled-request count in the navigation, live now that F8
 * exists. Kept quiet (`tone="neutral"`) when there is nothing to do, and
 * `hivis` once something is: an unhandled request is work waiting to be
 * lost (`BOOKING_REQUEST_STATUS_MEANING`).
 *
 * The count is read through the shared query cache, so the badge and the dot
 * below it cost one request between them however many times they render.
 */
function useUnhandledBookingCount(): number | undefined {
  const query = useBookingRequests({ status: 'PENDING', limit: 1 });
  return query.data?.unhandledCount;
}

/**
 * Visibility is the caller's decision, not this component's. The nav renders
 * it inside the label, which is already hidden in the collapsed rail — a
 * `hidden lg:inline-flex` baked in here used to hide it in the mobile Sheet
 * too, where the label is the whole point of the menu.
 */
export function BookingBadge({ className }: { readonly className?: string }) {
  const count = useUnhandledBookingCount();

  if (count === undefined) {
    return null;
  }

  return (
    <Badge
      tone={count > 0 ? 'hivis' : 'neutral'}
      className={cn('tabular-nums', className)}
    >
      <CalendarClockIcon aria-hidden="true" />
      {count}
    </Badge>
  );
}

/**
 * The same signal for the icon-only rail (768–1099 px), where the label —
 * and with it the badge — is `sr-only`. A dot rather than a number: the rail
 * is 72 px wide and the point is only "there is something waiting".
 */
export function BookingDot({ className }: { readonly className?: string }) {
  const count = useUnhandledBookingCount();

  if (count === undefined || count === 0) {
    return null;
  }

  return (
    <span
      className={cn(
        'pointer-events-none absolute top-1.5 right-1/2 size-2 translate-x-3 rounded-full bg-status-hivis',
        className,
      )}
    >
      <span className="sr-only">{count} obehandlade förfrågningar</span>
    </span>
  );
}
