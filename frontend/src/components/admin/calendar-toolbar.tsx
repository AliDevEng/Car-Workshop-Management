'use client';

import { formatInTimeZone } from 'date-fns-tz';
import { sv } from 'date-fns/locale';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';
import { WORKSHOP_TIMEZONE, stockholmDate, type UserSummary } from 'shared';
import { Calendar } from '@/components/form/calendar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { addStockholmDays } from 'shared';
import { stockholmWeekDays, stockholmWeekStart } from '@/lib/admin/calendar';

export const MECHANIC_FILTER_ALL = 'ALL' as const;

function rangeLabel(view: 'week' | 'day', anchorDate: string): string {
  if (view === 'day') {
    const label = formatInTimeZone(
      `${anchorDate}T12:00:00.000Z`,
      WORKSHOP_TIMEZONE,
      'EEEE d MMMM yyyy',
      { locale: sv },
    );
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  const days = stockholmWeekDays(stockholmWeekStart(anchorDate));
  const start = days[0];
  const end = days[6];
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  const startLabel = formatInTimeZone(
    `${start}T12:00:00.000Z`,
    WORKSHOP_TIMEZONE,
    sameMonth ? 'd' : 'd MMM',
    { locale: sv },
  );
  const endLabel = formatInTimeZone(
    `${end}T12:00:00.000Z`,
    WORKSHOP_TIMEZONE,
    'd MMM yyyy',
    { locale: sv },
  );
  return `${startLabel}–${endLabel}`;
}

/** F8.3/F8.4's shared navigation: prev/next/today, a "go to date" jump using
 * the project's own calendar, and a mechanic filter. */
export function CalendarToolbar({
  view,
  onViewChange,
  anchorDate,
  onAnchorDateChange,
  mechanics,
  mechanicFilter,
  onMechanicFilterChange,
}: {
  readonly view: 'week' | 'day';
  readonly onViewChange: (view: 'week' | 'day') => void;
  readonly anchorDate: string;
  readonly onAnchorDateChange: (date: string) => void;
  readonly mechanics: readonly UserSummary[];
  readonly mechanicFilter: string;
  readonly onMechanicFilterChange: (value: string) => void;
}) {
  const [jumpOpen, setJumpOpen] = useState(false);
  const stepDays = view === 'day' ? 1 : 7;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          aria-label={view === 'day' ? 'Föregående dag' : 'Föregående vecka'}
          onClick={() => {
            onAnchorDateChange(addStockholmDays(anchorDate, -stepDays));
          }}
        >
          <ChevronLeftIcon aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            onAnchorDateChange(stockholmDate(new Date()));
          }}
        >
          Idag
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          aria-label={view === 'day' ? 'Nästa dag' : 'Nästa vecka'}
          onClick={() => {
            onAnchorDateChange(addStockholmDays(anchorDate, stepDays));
          }}
        >
          <ChevronRightIcon aria-hidden="true" />
        </Button>
      </div>

      <Popover open={jumpOpen} onOpenChange={setJumpOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" className="tabular-nums">
            {rangeLabel(view, anchorDate)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <Calendar
            value={anchorDate}
            disablePast={false}
            onChange={(value: string) => {
              onAnchorDateChange(value);
              setJumpOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>

      <div className="ml-auto flex items-center gap-2">
        <Select
          value={mechanicFilter}
          onValueChange={onMechanicFilterChange}
        >
          <SelectTrigger aria-label="Filtrera på mekaniker" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={MECHANIC_FILTER_ALL}>Alla mekaniker</SelectItem>
            {mechanics.map((mechanic) => (
              <SelectItem key={mechanic.id} value={mechanic.id}>
                {mechanic.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex overflow-hidden rounded-sharp border border-border">
          <Button
            type="button"
            variant={view === 'week' ? 'secondary' : 'ghost'}
            size="sm"
            className="rounded-none border-0"
            aria-pressed={view === 'week'}
            onClick={() => {
              onViewChange('week');
            }}
          >
            Vecka
          </Button>
          <Button
            type="button"
            variant={view === 'day' ? 'secondary' : 'ghost'}
            size="sm"
            className="rounded-none border-0 border-l border-border"
            aria-pressed={view === 'day'}
            onClick={() => {
              onViewChange('day');
            }}
          >
            Dag
          </Button>
        </div>
      </div>
    </div>
  );
}
