'use client';

import { formatInTimeZone } from 'date-fns-tz';
import { sv } from 'date-fns/locale';
import { useState, type DragEvent } from 'react';
import {
  WORKSHOP_TIMEZONE,
  stockholmDate,
  type BookingWithRelations,
  type UserSummary,
} from 'shared';
import { BookingBlock } from '@/components/admin/booking-block';
import {
  DEFAULT_CALENDAR_GRID_BOUNDS,
  calendarHourLabel,
  calendarRowSpan,
  calendarSlotCount,
  calendarSlotToLocalTime,
  isPastLocalDateTime,
  isWeekendLocalDate,
  type CalendarGridBounds,
} from '@/lib/admin/calendar';
import { cn } from '@/lib/utils';

const SLOT_HEIGHT_PX = 44;
const DAY_COLUMN_WIDTH_PX = 140;
const DENSE_COLUMN_WIDTH_PX = 220;

interface GridColumn {
  readonly id: string | null;
  readonly name: string;
}

/** `null` stands for every booking with no assigned mechanic — an unassigned
 * booking occupies nobody's calendar, mirroring the exclusion constraint's
 * own partial index (§6.2, B5.4.4), so it still needs somewhere to render. */
const UNASSIGNED_COLUMN: GridColumn = { id: null, name: 'Ej tilldelad' };

function dayHeaderLabel(day: string, dense: boolean): string {
  const pattern = dense ? 'EEEE d MMMM' : 'EEE d/M';
  const label = formatInTimeZone(
    `${day}T12:00:00.000Z`,
    WORKSHOP_TIMEZONE,
    pattern,
    { locale: sv },
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export interface CalendarGridProps {
  readonly days: readonly string[];
  readonly mechanics: readonly UserSummary[];
  readonly bookings: readonly BookingWithRelations[];
  readonly onBookingClick: (booking: BookingWithRelations) => void;
  /** A drop on a slot that is not in the past. Never called for a past one —
   * the grid refuses the drop itself (F8's "no booking in the past" rule). */
  readonly onReschedule: (
    bookingId: string,
    day: string,
    mechanicId: string | null,
    startTime: string,
  ) => void;
  /** The day view's wider, more detailed columns (F8.4.1). */
  readonly dense?: boolean;
  /** Injectable for tests; defaults to the real current instant. */
  readonly now?: Date;
  readonly bounds?: CalendarGridBounds;
}

/**
 * The shared grid behind both the week view (F8.3) and the day view (F8.4) —
 * hours down the side, one column per mechanic (plus "Ej tilldelad"), status
 * colour-coded blocks, drag to reschedule. The day view is this same grid
 * given a single day and `dense`, not a separate implementation: F8.4.1's
 * "denser, showing full job details" is wider columns and more text per
 * card, not a different structure.
 *
 * Saturday and Sunday columns are tinted the same red the custom date picker
 * (`components/form/calendar.tsx`) uses, for one calendar-wide convention.
 */
export function CalendarGrid({
  days,
  mechanics,
  bookings,
  onBookingClick,
  onReschedule,
  dense = false,
  now = new Date(),
  bounds = DEFAULT_CALENDAR_GRID_BOUNDS,
}: CalendarGridProps) {
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);

  const columns: readonly GridColumn[] = [
    ...mechanics.map((mechanic) => ({ id: mechanic.id, name: mechanic.name })),
    UNASSIGNED_COLUMN,
  ];
  const slotCount = calendarSlotCount(bounds);
  const hours = Array.from(
    { length: bounds.endHour - bounds.startHour },
    (_, index) => bounds.startHour + index,
  );
  const columnWidthPx = dense ? DENSE_COLUMN_WIDTH_PX : DAY_COLUMN_WIDTH_PX;
  const dayWidthPx = columns.length * columnWidthPx;

  function columnIndexFor(booking: BookingWithRelations): number {
    if (booking.assignedUserId === null) {
      return columns.length - 1;
    }
    const index = columns.findIndex(
      (column) => column.id === booking.assignedUserId,
    );
    return index === -1 ? columns.length - 1 : index;
  }

  function slotKey(day: string, columnIndex: number, rowIndex: number): string {
    return `${day}:${String(columnIndex)}:${String(rowIndex)}`;
  }

  return (
    <div
      className="overflow-auto rounded-sharp border border-border"
      style={{ maxHeight: '72vh' }}
    >
      <div className="flex" style={{ width: 'max-content' }}>
        <div className="sticky left-0 z-20 flex w-14 shrink-0 flex-col bg-card">
          <div className="sticky top-0 z-10 h-11 border-b border-border bg-card" />
          <div className="sticky top-11 z-10 h-7 border-b border-border bg-card" />
          <div
            style={{
              display: 'grid',
              gridTemplateRows: `repeat(${String(slotCount)}, ${String(SLOT_HEIGHT_PX)}px)`,
            }}
          >
            {hours.map((hour) => (
              <div
                key={hour}
                style={{ gridRow: 'span 2' }}
                className="relative border-b border-border/60"
              >
                <span className="absolute -top-2 right-1 text-xs tabular-nums text-muted-foreground">
                  {calendarHourLabel(hour)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {days.map((day) => {
          const weekend = isWeekendLocalDate(day);
          const dayBookings = bookings.filter(
            (booking) => stockholmDate(new Date(booking.startsAt)) === day,
          );

          /**
           * The drop target, read from the pointer position relative to the
           * day's own grid container — never from `event.target`. A booking
           * block sits visually on top of the background cells (`z-10`), so
           * a drop landing on an *occupied* slot reports the block as the
           * element under the cursor; resolving position instead of target
           * is what makes F8.6.2 (dropping onto an occupied slot) reach this
           * handler at all, rather than being silently swallowed by the
           * block underneath the cursor.
           */
          function resolveDragTarget(
            event: DragEvent<HTMLDivElement>,
          ): { readonly rowIndex: number; readonly columnIndex: number; readonly past: boolean } {
            const rect = event.currentTarget.getBoundingClientRect();
            const rowIndex = Math.min(
              Math.max(
                Math.floor((event.clientY - rect.top) / SLOT_HEIGHT_PX),
                0,
              ),
              slotCount - 1,
            );
            const columnIndex = Math.min(
              Math.max(
                Math.floor(
                  ((event.clientX - rect.left) / rect.width) * columns.length,
                ),
                0,
              ),
              columns.length - 1,
            );
            const localTime = calendarSlotToLocalTime(rowIndex, bounds);
            return {
              rowIndex,
              columnIndex,
              past: isPastLocalDateTime(`${day}T${localTime}`, now),
            };
          }

          return (
            <div
              key={day}
              className="flex shrink-0 flex-col border-l border-border"
              style={{ width: dayWidthPx }}
            >
              <div
                className={cn(
                  'sticky top-0 z-10 flex h-11 items-center justify-center border-b border-border bg-card text-sm font-medium',
                  weekend && 'text-status-oxide',
                )}
              >
                {dayHeaderLabel(day, dense)}
              </div>
              <div
                className="sticky top-11 z-10 grid h-7 border-b border-border bg-card text-[0.6875rem] text-muted-foreground"
                style={{
                  gridTemplateColumns: `repeat(${String(columns.length)}, minmax(0, 1fr))`,
                }}
              >
                {columns.map((column) => (
                  <div
                    key={column.id ?? 'unassigned'}
                    className="flex items-center justify-center truncate px-1"
                  >
                    {column.name}
                  </div>
                ))}
              </div>

              <div
                className="relative grid"
                style={{
                  gridTemplateColumns: `repeat(${String(columns.length)}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${String(slotCount)}, ${String(SLOT_HEIGHT_PX)}px)`,
                }}
                onDragOver={(event: DragEvent<HTMLDivElement>) => {
                  const target = resolveDragTarget(event);
                  if (target.past) {
                    return;
                  }
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  setDragOverSlot(slotKey(day, target.columnIndex, target.rowIndex));
                }}
                onDragLeave={() => {
                  setDragOverSlot(null);
                }}
                onDrop={(event: DragEvent<HTMLDivElement>) => {
                  event.preventDefault();
                  setDragOverSlot(null);
                  const target = resolveDragTarget(event);
                  if (target.past) {
                    return;
                  }
                  const bookingId = event.dataTransfer.getData('text/plain');
                  if (bookingId === '') {
                    return;
                  }
                  const column = columns[target.columnIndex];
                  if (column === undefined) {
                    return;
                  }
                  onReschedule(
                    bookingId,
                    day,
                    column.id,
                    calendarSlotToLocalTime(target.rowIndex, bounds),
                  );
                }}
              >
                {Array.from({ length: slotCount }, (_, rowIndex) =>
                  columns.map((column, columnIndex) => {
                    const localTime = calendarSlotToLocalTime(
                      rowIndex,
                      bounds,
                    );
                    const past = isPastLocalDateTime(`${day}T${localTime}`, now);
                    const key = slotKey(day, columnIndex, rowIndex);

                    return (
                      <div
                        key={key}
                        style={{ gridColumn: columnIndex + 1, gridRow: rowIndex + 1 }}
                        className={cn(
                          'border-b border-border/40',
                          columnIndex > 0 && 'border-l border-border/40',
                          weekend && 'bg-oxide/4',
                          past && 'bg-muted/50',
                          dragOverSlot === key && !past && 'bg-signal/20',
                        )}
                      />
                    );
                  }),
                )}

                {dayBookings.map((booking) => {
                  const span = calendarRowSpan(
                    booking.startsAt,
                    booking.endsAt,
                    day,
                    bounds,
                  );
                  const columnIndex = columnIndexFor(booking);
                  return (
                    <BookingBlock
                      key={booking.id}
                      booking={booking}
                      clipped={span.clipped}
                      draggable={booking.status === 'SCHEDULED'}
                      onDragStart={(event: DragEvent<HTMLButtonElement>) => {
                        event.dataTransfer.setData('text/plain', booking.id);
                        event.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={() => {
                        onBookingClick(booking);
                      }}
                      style={{
                        gridColumn: columnIndex + 1,
                        gridRow: `${String(span.rowStart)} / ${String(span.rowEnd)}`,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
