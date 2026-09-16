'use client';

import type { CSSProperties, DragEvent } from 'react';
import type { BookingWithRelations } from 'shared';
import { STATUS_PRESENTATION, bookingStatus } from '@/components/admin/status';
import { formatTime } from '@/lib/format/date';
import { cn } from '@/lib/utils';

const TONE_CLASSES: Readonly<Record<string, string>> = {
  neutral: 'border-border bg-card text-foreground',
  signal: 'border-signal/50 bg-signal/14 text-status-signal',
  hivis: 'border-hivis/55 bg-hivis/18 text-status-hivis',
  oxide: 'border-oxide/50 bg-oxide/14 text-status-oxide',
  moss: 'border-moss/50 bg-moss/14 text-status-moss',
};

/**
 * One booking on the week/day grid (F8.3.2, F8.3.3). Positioned by its
 * caller via `style.gridColumn`/`gridRow` — this component only knows how to
 * render itself, not where it goes.
 */
export function BookingBlock({
  booking,
  style,
  draggable,
  onDragStart,
  onClick,
  clipped,
}: {
  readonly booking: BookingWithRelations;
  readonly style: CSSProperties;
  readonly draggable: boolean;
  readonly onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  readonly onClick: () => void;
  /** The real interval reaches outside the visible grid (`calendarRowSpan`). */
  readonly clipped: boolean;
}) {
  const { meaning } = bookingStatus(booking.status);
  const tone = STATUS_PRESENTATION[meaning].tone;

  return (
    <button
      // The dashboard's "today's bookings" card (F5) links here with
      // `#booking-{id}`; `bookings-calendar-page.tsx` scrolls to it once the
      // day's data has rendered.
      id={`booking-${booking.id}`}
      type="button"
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onClick}
      style={style}
      className={cn(
        'z-10 m-0.5 flex min-h-9 flex-col overflow-hidden rounded-sharp border px-1.5 py-1 text-left text-xs leading-tight',
        'focus-visible:outline-2 focus-visible:outline-offset-1',
        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        TONE_CLASSES[tone],
      )}
    >
      <span className="truncate font-medium tabular-nums">
        {formatTime(booking.startsAt)}–{formatTime(booking.endsAt)}
        {clipped ? ' ⋯' : ''}
      </span>
      <span className="truncate">{booking.customer.name}</span>
      {booking.vehicle === null ? null : (
        <span className="truncate tabular-nums opacity-80">
          {booking.vehicle.registrationNumberDisplay}
        </span>
      )}
    </button>
  );
}
