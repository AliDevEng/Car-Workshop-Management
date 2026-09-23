'use client';

import { stockholmWallClockToUtc, type BookingWithRelations } from 'shared';
import { calendarRangeForDay } from '@/lib/admin/calendar';
import { useCalendar } from '@/lib/api/bookings';
import { formatTime } from '@/lib/format/date';

/**
 * What else is already booked on the day being chosen, and whether the
 * proposed interval collides with any of it.
 *
 * **This is advice, not a check.** The real guarantee is the `EXCLUDE USING
 * gist` constraint the insert runs into (§6.2) — reading the calendar and
 * inserting if it looked free is precisely the race two owners hit on the same
 * morning. What this panel buys is that the staff member sees the collision
 * *while the customer is still on the telephone*, instead of filling in a form
 * and being refused at the end of it.
 *
 * Shared by the confirmation dialog and the telephone-booking dialog, because
 * two implementations of "is this slot free?" would eventually disagree with
 * each other in front of a customer.
 */

export interface BookingSlotAvailability {
  /** Everything on that day for the chosen mechanic, or for everyone. */
  readonly sameDay: readonly BookingWithRelations[];
  readonly overlapping: readonly BookingWithRelations[];
}

/**
 * Cancelled and no-show bookings are excluded, matching the partial `WHERE`
 * on the exclusion constraint itself (`BOOKING_STATUSES_NOT_OCCUPYING_A_SLOT`)
 * — a slot a cancelled booking no longer occupies must not be shown as taken.
 */
export function useBookingSlotAvailability({
  date,
  localStart,
  localEnd,
  assignedUserId,
}: {
  readonly date: string | null;
  readonly localStart: string | null;
  readonly localEnd: string | null;
  /** `null` for an unassigned booking, which occupies nobody's calendar. */
  readonly assignedUserId: string | null;
}): BookingSlotAvailability {
  const dayQuery = useCalendar(
    date === null ? { from: '', to: '' } : calendarRangeForDay(date),
    { enabled: date !== null },
  );

  const sameDay = (dayQuery.data?.data ?? []).filter(
    (booking: BookingWithRelations) =>
      booking.status !== 'CANCELLED' &&
      booking.status !== 'NO_SHOW' &&
      (assignedUserId === null || booking.assignedUserId === assignedUserId),
  );

  const startMs =
    localStart === null ? null : stockholmWallClockToUtc(localStart).getTime();
  const endMs =
    localEnd === null ? null : stockholmWallClockToUtc(localEnd).getTime();

  const overlapping =
    startMs === null || endMs === null
      ? []
      : sameDay.filter((booking: BookingWithRelations) => {
          const bookingStart = new Date(booking.startsAt).getTime();
          const bookingEnd = new Date(booking.endsAt).getTime();
          // Half-open, `[)`: a job ending at 10:00 and one starting at 10:00
          // are adjacent, which is how a workshop books a day (B5.4.6).
          return startMs < bookingEnd && bookingStart < endMs;
        });

  return { sameDay, overlapping };
}

export function BookingSlotAvailabilityPanel({
  availability,
  assignedUserId,
}: {
  readonly availability: BookingSlotAvailability;
  readonly assignedUserId: string | null;
}) {
  if (availability.sameDay.length === 0) {
    return null;
  }

  const overlappingIds = new Set(
    availability.overlapping.map((booking) => booking.id),
  );

  return (
    <div className="flex flex-col gap-1 rounded-sharp border border-border p-3">
      <p className="text-xs font-medium text-muted-foreground">
        {assignedUserId === null
          ? 'Andra bokningar samma dag'
          : 'Mekanikerns övriga bokningar samma dag'}
      </p>
      {/* Capped and scrollable. A busy Saturday with a dozen jobs pushed the
          form's own fields below the fold, so the panel that exists to help
          choose a time hid the fields the time is chosen in — the same
          `max-h-40` the dialogs' search result lists already use. */}
      <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto text-sm">
        {availability.sameDay.map((booking: BookingWithRelations) => (
          <li
            key={booking.id}
            className={
              overlappingIds.has(booking.id)
                ? 'text-status-oxide'
                : 'text-muted-foreground'
            }
          >
            <span className="tabular-nums">
              {formatTime(booking.startsAt)}–{formatTime(booking.endsAt)}
            </span>{' '}
            {booking.customer.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
