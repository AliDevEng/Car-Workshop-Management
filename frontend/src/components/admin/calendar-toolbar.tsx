'use client';

import { formatInTimeZone } from 'date-fns-tz';
import { sv } from 'date-fns/locale';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { WORKSHOP_TIMEZONE, stockholmDate, type UserSummary } from 'shared';
import { DatePicker } from '@/components/form/date-picker';
import { Button } from '@/components/ui/button';
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
  anchorDate,
  onAnchorDateChange,
  mechanics,
  mechanicFilter,
  onMechanicFilterChange,
}: {
  readonly view: 'week' | 'day';
  readonly anchorDate: string;
  readonly onAnchorDateChange: (date: string) => void;
  readonly mechanics: readonly UserSummary[];
  readonly mechanicFilter: string;
  readonly onMechanicFilterChange: (value: string) => void;
}) {
  const stepDays = view === 'day' ? 1 : 7;

  return (
    <div className="flex flex-wrap items-end gap-3">
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

      <div className="flex min-w-[220px] flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          {view === 'day' ? 'Dag' : 'Vecka'}
        </span>
        <DatePicker
          value={anchorDate}
          onChange={(value) => {
            if (value !== null) {
              onAnchorDateChange(value);
            }
          }}
          disablePast={false}
          placeholder={rangeLabel(view, anchorDate)}
        />
      </div>

      <div className="ml-auto flex min-w-[180px] flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          Mekaniker
        </span>
        <Select value={mechanicFilter} onValueChange={onMechanicFilterChange}>
          <SelectTrigger aria-label="Filtrera på mekaniker" className="w-full">
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
      </div>
    </div>
  );
}
