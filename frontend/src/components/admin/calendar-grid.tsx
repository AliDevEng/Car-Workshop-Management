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

/**
 * 36 px, down from 44. Twenty slots at 44 px plus two header rows is 950 px
 * of grid, so a working day never fitted a laptop screen and the calendar
 * page measured 2.1× the viewport (UI_UX_AUDIT C2/G3).
 */
const SLOT_HEIGHT_PX = 36;
/**
 * Columns flex to fill the available width and only stop shrinking here.
 * They used to be a fixed 140 px per mechanic per day — 420 px per day, and
 * 2 940 px for a week, so a 1 440 px screen showed two and a half days
 * (UI_UX_AUDIT C1).
 */
const MIN_WEEK_COLUMN_PX = 120;
const MIN_DAY_COLUMN_PX = 180;

interface GridColumn {
  readonly id: string | null;
  readonly name: string;
}

/** `null` stands for every booking with no assigned mechanic — an unassigned
 * booking occupies nobody's calendar, mirroring the exclusion constraint's
 * own partial index (§6.2, B5.4.4), so it still needs somewhere to render. */
const UNASSIGNED_COLUMN: GridColumn = { id: null, name: 'Ej tilldelad' };
/** The week view's single column per day: every mechanic together. */
const ALL_MECHANICS_COLUMN: GridColumn = { id: null, name: '' };

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

/**
 * Side-by-side lanes for bookings that overlap in time.
 *
 * Only the week view needs this: there one column holds every mechanic's
 * work, so two jobs at nine o'clock would otherwise be drawn on top of each
 * other. Greedy — each booking takes the first lane whose previous booking
 * has already ended — and the lane count is per day, which for a two-mechanic
 * workshop is at most two or three.
 */
function assignLanes(
  dayBookings: readonly BookingWithRelations[],
): { readonly lanes: ReadonlyMap<string, number>; readonly laneCount: number } {
  const ordered = [...dayBookings].sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt),
  );
  const laneEnds: number[] = [];
  const lanes = new Map<string, number>();

  for (const booking of ordered) {
    const start = new Date(booking.startsAt).getTime();
    const end = new Date(booking.endsAt).getTime();
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) {
      lane = laneEnds.length;
    }
    laneEnds[lane] = end;
    lanes.set(booking.id, lane);
  }

  return { lanes, laneCount: Math.max(1, laneEnds.length) };
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
  /** The day view's wider, per-mechanic columns (F8.4.1). */
  readonly dense?: boolean;
  /** Injectable for tests; defaults to the real current instant. */
  readonly now?: Date;
  readonly bounds?: CalendarGridBounds;
}

/**
 * The shared grid behind both the week view (F8.3) and the day view (F8.4) —
 * hours down the side, status colour-coded blocks, drag to reschedule.
 *
 * The two views differ in what a column *is*. The day view gives each
 * mechanic (plus "Ej tilldelad") a column, which is what makes it the view
 * you plan in. The week view gives each **day** one column and puts every
 * mechanic in it, labelled on the block: splitting seven days by mechanic
 * needed 2 940 px of width for a workshop that has two of them (C1).
 * Dragging in the week view therefore moves a booking in time and leaves its
 * mechanic alone.
 *
 * Both axes scroll inside this component's own box, with the headers stuck
 * to its top — not the page's, which is what left a 64 px empty band above
 * the day names and let them scroll away anyway (C2).
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

  const splitByMechanic = dense;
  const columns: readonly GridColumn[] = splitByMechanic
    ? [
        ...mechanics.map((mechanic) => ({
          id: mechanic.id,
          name: mechanic.name,
        })),
        UNASSIGNED_COLUMN,
      ]
    : [ALL_MECHANICS_COLUMN];
  const slotCount = calendarSlotCount(bounds);
  const hours = Array.from(
    { length: bounds.endHour - bounds.startHour },
    (_, index) => bounds.startHour + index,
  );
  const minDayWidthPx =
    columns.length * (dense ? MIN_DAY_COLUMN_PX : MIN_WEEK_COLUMN_PX);

  function columnIndexFor(booking: BookingWithRelations): number {
    if (!splitByMechanic) {
      return 0;
    }
    if (booking.assignedUserId === null) {
      return columns.length - 1;
    }
    const index = columns.findIndex(
      (column) => column.id === booking.assignedUserId,
    );
    return index === -1 ? columns.length - 1 : index;
  }

  function mechanicNameFor(booking: BookingWithRelations): string {
    return booking.assignedUser === null
      ? 'Ej tilldelad'
      : booking.assignedUser.name;
  }

  function slotKey(day: string, columnIndex: number, rowIndex: number): string {
    return `${day}:${String(columnIndex)}:${String(rowIndex)}`;
  }

  return (
    <div className="max-h-[calc(100dvh-17rem)] min-h-64 overflow-auto rounded-sharp border border-border">
      <div className="flex min-w-max">
        <div className="sticky left-0 z-20 flex w-14 shrink-0 flex-col bg-card">
          <div className="sticky top-0 z-10 h-11 border-b border-border bg-card" />
          {splitByMechanic ? (
            <div className="sticky top-11 z-10 h-7 border-b border-border bg-card" />
          ) : null}
          <div
            style={{
              display: 'grid',
              gridTemplateRows: `repeat(${String(slotCount)}, ${String(SLOT_HEIGHT_PX)}px)`,
            }}
          >
            {hours.map((hour, index) => (
              <div
                key={hour}
                style={{ gridRow: 'span 2' }}
                className="relative border-b border-border/60"
              >
                <span
                  className={cn(
                    'absolute right-1 text-xs tabular-nums text-muted-foreground',
                    // Every label straddles its hour line, except the first:
                    // there is no line above it, only the top of the scroll
                    // box, which clipped it in half.
                    index === 0 ? 'top-0.5' : '-top-2',
                  )}
                >
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
          const { lanes, laneCount } = splitByMechanic
            ? { lanes: new Map<string, number>(), laneCount: 1 }
            : assignLanes(dayBookings);

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
          function resolveDragTarget(event: DragEvent<HTMLDivElement>): {
            readonly rowIndex: number;
            readonly columnIndex: number;
            readonly past: boolean;
          } {
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
              className="flex flex-col border-l border-border"
              style={{ flex: '1 1 0', minWidth: minDayWidthPx }}
            >
              <div
                className={cn(
                  'sticky top-0 z-10 flex h-11 items-center justify-center border-b border-border bg-card text-sm font-medium',
                  weekend && 'text-status-oxide',
                )}
              >
                {dayHeaderLabel(day, dense)}
              </div>
              {splitByMechanic ? (
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
              ) : null}

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
                  setDragOverSlot(
                    slotKey(day, target.columnIndex, target.rowIndex),
                  );
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
                  // In the week view a column is a *day*, not a mechanic, so
                  // the drop must not reassign one. The booking keeps whoever
                  // it already had.
                  const dragged = bookings.find(
                    (candidate) => candidate.id === bookingId,
                  );
                  const mechanicId = splitByMechanic
                    ? column.id
                    : (dragged?.assignedUserId ?? null);
                  onReschedule(
                    bookingId,
                    day,
                    mechanicId,
                    calendarSlotToLocalTime(target.rowIndex, bounds),
                  );
                }}
              >
                {Array.from({ length: slotCount }, (_, rowIndex) =>
                  columns.map((column, columnIndex) => {
                    const localTime = calendarSlotToLocalTime(rowIndex, bounds);
                    const past = isPastLocalDateTime(
                      `${day}T${localTime}`,
                      now,
                    );
                    const key = slotKey(day, columnIndex, rowIndex);

                    return (
                      <div
                        key={key}
                        style={{
                          gridColumn: columnIndex + 1,
                          gridRow: rowIndex + 1,
                        }}
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
                  const lane = lanes.get(booking.id) ?? 0;
                  return (
                    <BookingBlock
                      key={booking.id}
                      booking={booking}
                      clipped={span.clipped}
                      draggable={booking.status === 'SCHEDULED'}
                      {...(splitByMechanic
                        ? {}
                        : { mechanicName: mechanicNameFor(booking) })}
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
                        ...(laneCount > 1
                          ? {
                              width: `${String(100 / laneCount)}%`,
                              marginLeft: `${String((lane * 100) / laneCount)}%`,
                            }
                          : {}),
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
