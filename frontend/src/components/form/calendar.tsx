'use client';

import { formatInTimeZone } from 'date-fns-tz';
import { sv } from 'date-fns/locale';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { addStockholmDays, stockholmDate } from 'shared';
import { Button } from '@/components/ui/button';
import {
  isPastLocalDate,
  isWeekendLocalDate,
  monthGridWeeks,
  type WeekDays,
} from '@/lib/admin/calendar';
import { cn } from '@/lib/utils';

const WEEKDAY_LABELS = [
  'Mån',
  'Tis',
  'Ons',
  'Tor',
  'Fre',
  'Lör',
  'Sön',
] as const;

const ARROW_KEY_DELTAS: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowLeft: -1,
  ArrowDown: 7,
  ArrowUp: -7,
};

function monthAnchorOf(localDate: string): string {
  return `${localDate.slice(0, 7)}-01`;
}

/** Parsed by position, matching `shared/time.ts`'s `parseLocalDate`. */
function shiftMonth(monthAnchor: string, delta: number): string {
  const year = Number(monthAnchor.slice(0, 4));
  const month = Number(monthAnchor.slice(5, 7));
  return new Date(Date.UTC(year, month - 1 + delta, 1))
    .toISOString()
    .slice(0, 10);
}

/** "mars 2026" — formatted in UTC so the label cannot shift a day near
 * midnight depending on the browser's own timezone; the input is already a
 * bare calendar date with no zone of its own (§3.6). */
function monthLabel(monthAnchor: string): string {
  const label = formatInTimeZone(
    `${monthAnchor}T00:00:00.000Z`,
    'UTC',
    'MMMM yyyy',
    { locale: sv },
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export interface CalendarAriaProps {
  readonly 'aria-describedby'?: string;
  readonly 'aria-invalid'?: boolean;
  readonly 'aria-required'?: boolean;
}

export interface CalendarProps extends CalendarAriaProps {
  readonly value: string | null;
  readonly onChange: (value: string) => void;
  /** Refuses every date before today (Stockholm). On by default — this
   * calendar exists to book a future visit, never a past one. */
  readonly disablePast?: boolean;
  readonly id?: string;
  /** Injectable for tests; defaults to the real Stockholm calendar date. */
  readonly today?: string;
}

/**
 * The project's own month calendar — not a native `<input type="date">`,
 * built so Saturday and Sunday can be marked in red and a past date refused
 * at the point of selection, not only at submit time. Used wherever staff
 * pick a booking date (F8.2), and reusable for a "go to date" jump in the
 * week/day views (F8.3–F8.4).
 *
 * A full `role="grid"` widget with roving `tabIndex` rather than 42 separate
 * tab stops: arrow keys move the focused day, Enter/Space selects it, and
 * only one day is ever a tab stop at a time (the same pattern `DataTable`
 * uses for its rows).
 */
export function Calendar({
  value,
  onChange,
  disablePast = true,
  id,
  today = stockholmDate(new Date()),
  ...aria
}: CalendarProps) {
  const [monthAnchor, setMonthAnchor] = useState(() =>
    monthAnchorOf(value ?? today),
  );
  const [focusedDate, setFocusedDate] = useState(() => value ?? today);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef(false);

  useEffect(() => {
    if (pendingFocus.current) {
      buttonRefs.current.get(focusedDate)?.focus();
      pendingFocus.current = false;
    }
    // `monthAnchor` matters too: moving focus across a month boundary
    // re-renders this month's grid before the target button exists.
  }, [focusedDate, monthAnchor]);

  function isDisabled(date: string): boolean {
    return disablePast && isPastLocalDate(date, today);
  }

  function moveFocusTo(date: string): void {
    setFocusedDate(date);
    setMonthAnchor(monthAnchorOf(date));
    pendingFocus.current = true;
  }

  function selectDate(date: string): void {
    if (isDisabled(date)) {
      return;
    }
    onChange(date);
    moveFocusTo(date);
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    date: string,
  ): void {
    const delta = ARROW_KEY_DELTAS[event.key];
    if (delta !== undefined) {
      event.preventDefault();
      moveFocusTo(addStockholmDays(date, delta));
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectDate(date);
    }
  }

  const weeks = monthGridWeeks(monthAnchor);

  return (
    <div
      id={id}
      className="w-full max-w-sm rounded-soft border border-border bg-card p-3"
      {...aria}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            setMonthAnchor((current) => shiftMonth(current, -1));
          }}
          aria-label="Föregående månad"
        >
          <ChevronLeftIcon aria-hidden="true" />
        </Button>
        <p aria-live="polite" className="text-sm font-medium">
          {monthLabel(monthAnchor)}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            setMonthAnchor((current) => shiftMonth(current, 1));
          }}
          aria-label="Nästa månad"
        >
          <ChevronRightIcon aria-hidden="true" />
        </Button>
      </div>

      <div role="grid" aria-label="Välj datum">
        <div role="row" className="grid grid-cols-7">
          {WEEKDAY_LABELS.map((label, index) => (
            <div
              key={label}
              role="columnheader"
              className={cn(
                'py-1 text-center text-xs font-medium text-muted-foreground',
                index >= 5 && 'text-status-oxide',
              )}
            >
              {label}
            </div>
          ))}
        </div>

        {weeks.map((week: WeekDays) => (
          <div role="row" key={week[0]} className="grid grid-cols-7 gap-0.5">
            {week.map((date: string) => {
              const inMonth = date.slice(0, 7) === monthAnchor.slice(0, 7);
              const disabled = isDisabled(date);
              const selected = date === value;
              const isToday = date === today;
              const weekend = isWeekendLocalDate(date);

              return (
                <button
                  key={date}
                  ref={(node) => {
                    if (node === null) {
                      buttonRefs.current.delete(date);
                    } else {
                      buttonRefs.current.set(date, node);
                    }
                  }}
                  type="button"
                  data-date={date}
                  role="gridcell"
                  aria-selected={selected}
                  aria-current={isToday ? 'date' : undefined}
                  aria-disabled={disabled ? true : undefined}
                  tabIndex={date === focusedDate ? 0 : -1}
                  disabled={disabled}
                  onClick={() => {
                    selectDate(date);
                  }}
                  onFocus={() => {
                    setFocusedDate(date);
                  }}
                  onKeyDown={(event) => {
                    handleKeyDown(event, date);
                  }}
                  className={cn(
                    'flex h-11 w-full items-center justify-center rounded-sharp text-sm tabular-nums',
                    !inMonth && 'text-muted-foreground/50',
                    weekend && 'bg-oxide/6',
                    weekend && inMonth && !selected && 'text-status-oxide',
                    isToday && !selected && 'border border-signal',
                    selected && 'bg-primary text-primary-foreground',
                    disabled && 'cursor-not-allowed opacity-40',
                    !disabled &&
                      !selected &&
                      'hover:bg-accent focus-visible:bg-accent',
                  )}
                >
                  {Number(date.slice(8, 10))}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
