'use client';

import { CalendarDaysIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { Calendar } from '@/components/form/calendar';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { formatDateOnly } from '@/lib/format/date';
import { cn } from '@/lib/utils';

export interface DatePickerProps {
  readonly value: string | null;
  readonly onChange: (value: string | null) => void;
  readonly id?: string;
  readonly placeholder?: string;
  readonly disablePast?: boolean;
  readonly optional?: boolean;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly 'aria-describedby'?: string | undefined;
  readonly 'aria-invalid'?: boolean | undefined;
  readonly 'aria-required'?: boolean | undefined;
}

/**
 * One date picker for the application. It wraps the project's own `Calendar`
 * so staff never get a mix of native browser pickers and the workshop calendar.
 */
export function DatePicker({
  value,
  onChange,
  id,
  placeholder = 'Välj datum',
  disablePast = false,
  optional = false,
  disabled = false,
  className,
  ...aria
}: DatePickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn('flex min-w-0 items-center gap-1.5', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="secondary"
            disabled={disabled}
            className={cn(
              'h-11 min-w-0 flex-1 justify-start px-3 tabular-nums',
              value === null && 'text-muted-foreground',
            )}
            {...aria}
          >
            <CalendarDaysIcon aria-hidden="true" />
            <span className="min-w-0 truncate">
              {value === null ? placeholder : formatDateOnly(value)}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <Calendar
            value={value}
            disablePast={disablePast}
            onChange={(next: string) => {
              onChange(next);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>

      {optional && value !== null && !disabled ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Rensa datum"
          onClick={() => {
            onChange(null);
          }}
        >
          <XIcon aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
