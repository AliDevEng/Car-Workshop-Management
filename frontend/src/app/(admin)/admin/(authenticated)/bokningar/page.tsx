import { BOOKING_REQUEST_STATUSES, type BookingRequestStatus } from 'shared';
import { BookingsCalendarPage } from '@/components/admin/bookings-calendar-page';
import type { StatusFilter } from '@/components/admin/booking-request-inbox';
import {
  defaultBookingsDate,
  defaultBookingsTab,
} from '@/lib/admin/bookings-tab';
import {
  firstSearchParam,
  type AdminSearchParams,
} from '@/lib/admin/search-params';

function parseStatusFilter(value: string | undefined): StatusFilter | undefined {
  if (value === undefined) {
    return undefined;
  }
  return (BOOKING_REQUEST_STATUSES as readonly string[]).includes(value)
    ? (value as BookingRequestStatus)
    : undefined;
}

/**
 * F8 — calendar and booking requests. The server component only resolves the
 * initial tab/date from the URL (so a link like the dashboard's
 * `?date=...#booking-{id}` or `?vy=forfragningar` lands in the right place);
 * everything interactive lives in the client component (F8.3–F8.5 need
 * TanStack Query, drag-and-drop and the calendar's own client state).
 */
export default async function BookingsPage({
  searchParams,
}: {
  readonly searchParams: Promise<AdminSearchParams>;
}) {
  const params = await searchParams;
  const vy = firstSearchParam(params, 'vy');
  const date = firstSearchParam(params, 'date');
  const initialStatus = parseStatusFilter(firstSearchParam(params, 'status'));

  return (
    <BookingsCalendarPage
      initialTab={defaultBookingsTab(vy, date)}
      initialDate={defaultBookingsDate(date)}
      {...(initialStatus === undefined ? {} : { initialStatus })}
    />
  );
}
