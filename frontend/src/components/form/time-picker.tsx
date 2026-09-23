'use client';

import { ClockIcon } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  formatTimeOfDay,
  HOUR_OPTIONS,
  minuteOptions,
  pad2,
  parseTimeOfDay,
} from '@/lib/form/time-input';
import { cn } from '@/lib/utils';

/**
 * One time picker for the application, the twin of `DatePicker`.
 *
 * `<input type="time">` renders whatever the operating system feels like: a
 * spinner on one desktop, a full-screen wheel on a phone, a 12-hour AM/PM
 * field on a machine whose locale is not Swedish — and none of it can be
 * themed, so the admin panel's steel surface got a white system widget
 * dropped into the middle of a booking dialog. The AM/PM variant is a real
 * hazard beyond the looks: a booking is a promise to a person at a wall-clock
 * time, and 07:00 entered as 7 PM is a customer standing outside a locked
 * workshop.
 *
 * So the hours and the minutes are two listboxes we own, 24-hour throughout,
 * the way the workshop, the calendar grid and `shared/time.ts` all speak.
 * The arithmetic lives in `lib/form/time-input.ts` and is tested there.
 */

const ARROW_KEY_DELTAS: Readonly<Record<string, number>> = {
  ArrowDown: 1,
  ArrowUp: -1,
  ArrowRight: 1,
  ArrowLeft: -1,
};

function TimeColumn({
  label,
  options,
  value,
  onSelect,
}: {
  readonly label: string;
  readonly options: readonly number[];
  readonly value: number | null;
  readonly onSelect: (option: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef(new Map<number, HTMLButtonElement>());
  const [focused, setFocused] = useState<number | null>(value);
  const pendingFocus = useRef(false);

  /**
   * One tab stop per column, never one per option — a roving `tabIndex`, the
   * same pattern `Calendar` uses for its 42 days. Thirty-six separate tab
   * stops between the field and the dialog's save button is not a keyboard
   * path anyone walks twice.
   */
  const tabStop = focused ?? value ?? options[0] ?? 0;

  useEffect(() => {
    if (pendingFocus.current && focused !== null) {
      optionRefs.current.get(focused)?.focus();
      pendingFocus.current = false;
    }
  }, [focused]);

  /**
   * Centred by arithmetic rather than `scrollIntoView`, which scrolls every
   * scrollable ancestor to get there — including the dialog behind the
   * popover, which would jump under the pointer mid-selection.
   */
  useEffect(() => {
    const list = listRef.current;
    const selected = value === null ? undefined : optionRefs.current.get(value);
    if (list === null || selected === undefined) {
      return;
    }
    list.scrollTop =
      selected.offsetTop - list.clientHeight / 2 + selected.clientHeight / 2;
  }, [value]);

  function moveFocusTo(index: number): void {
    const next = options[Math.min(Math.max(index, 0), options.length - 1)];
    if (next === undefined) {
      return;
    }
    setFocused(next);
    pendingFocus.current = true;
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    option: number,
  ): void {
    const delta = ARROW_KEY_DELTAS[event.key];
    if (delta !== undefined) {
      event.preventDefault();
      moveFocusTo(options.indexOf(option) + delta);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      moveFocusTo(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      moveFocusTo(options.length - 1);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(option);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p className="text-center text-xs font-medium text-muted-foreground">
        {label}
      </p>
      <div
        ref={listRef}
        role="listbox"
        aria-label={label}
        className="h-52 w-20 overflow-y-auto rounded-sharp border border-border"
      >
        {options.map((option) => {
          const selected = option === value;
          return (
            <button
              key={option}
              ref={(node) => {
                if (node === null) {
                  optionRefs.current.delete(option);
                } else {
                  optionRefs.current.set(option, node);
                }
              }}
              type="button"
              role="option"
              aria-selected={selected}
              tabIndex={option === tabStop ? 0 : -1}
              onClick={() => {
                onSelect(option);
              }}
              onFocus={() => {
                setFocused(option);
              }}
              onKeyDown={(event) => {
                handleKeyDown(event, option);
              }}
              className={cn(
                'flex h-11 w-full items-center justify-center text-sm tabular-nums',
                selected
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-accent focus-visible:bg-accent',
              )}
            >
              {pad2(option)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface TimePickerProps {
  /** `HH:MM`, 24-hour. An empty string means nothing is chosen yet. */
  readonly value: string;
  readonly onChange: (value: string) => void;
  /**
   * The field's own name — "Starttid". It becomes the trigger's accessible
   * name, because the trigger is a button whose visible text is the time
   * itself, and "09:00" alone does not say which time it is.
   */
  readonly label: string;
  readonly id?: string;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly 'aria-describedby'?: string | undefined;
  readonly 'aria-invalid'?: boolean | undefined;
}

export function TimePicker({
  value,
  onChange,
  label,
  id,
  placeholder = 'Välj tid',
  disabled = false,
  className,
  ...aria
}: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const time = parseTimeOfDay(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="secondary"
          disabled={disabled}
          aria-label={time === null ? label : `${label} ${value}`}
          className={cn(
            'h-11 w-full min-w-0 justify-start px-3 tabular-nums',
            time === null && 'text-muted-foreground',
            className,
          )}
          {...aria}
        >
          <ClockIcon aria-hidden="true" />
          <span className="min-w-0 truncate">
            {time === null ? placeholder : value}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto">
        <div className="flex gap-2">
          <TimeColumn
            label="Timme"
            options={HOUR_OPTIONS}
            value={time?.hour ?? null}
            onSelect={(hour) => {
              onChange(formatTimeOfDay({ hour, minute: time?.minute ?? 0 }));
            }}
          />
          <TimeColumn
            label="Minut"
            options={minuteOptions(time?.minute ?? null)}
            value={time?.minute ?? null}
            onSelect={(minute) => {
              onChange(formatTimeOfDay({ hour: time?.hour ?? 0, minute }));
            }}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="mt-3 w-full"
          onClick={() => {
            setOpen(false);
          }}
        >
          Klar
        </Button>
      </PopoverContent>
    </Popover>
  );
}
