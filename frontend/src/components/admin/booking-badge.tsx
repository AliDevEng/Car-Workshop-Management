'use client';

import { CalendarClockIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useBookingRequests } from '@/lib/api/bookings';

/** F8.1.5 — the unhandled-request count in the navigation, live now that F8
 * exists. Kept quiet (`tone="neutral"`) when there is nothing to do, and
 * `hivis` once something is: an unhandled request is work waiting to be
 * lost (`BOOKING_REQUEST_STATUS_MEANING`). */
export function BookingBadge() {
  const query = useBookingRequests({ status: 'PENDING', limit: 1 });
  const count = query.data?.unhandledCount;

  if (count === undefined) {
    return null;
  }

  return (
    <Badge
      tone={count > 0 ? 'hivis' : 'neutral'}
      className="hidden tabular-nums lg:inline-flex"
    >
      <CalendarClockIcon aria-hidden="true" />
      {count}
    </Badge>
  );
}
