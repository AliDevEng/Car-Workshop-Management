'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  addStockholmDays,
  stockholmWallClockToUtc,
  type BookingWithRelations,
} from 'shared';
import { BookingDetailDialog } from '@/components/admin/booking-detail-dialog';
import {
  BookingRequestInbox,
  type StatusFilter,
} from '@/components/admin/booking-request-inbox';
import { CalendarGrid } from '@/components/admin/calendar-grid';
import {
  CalendarToolbar,
  MECHANIC_FILTER_ALL,
} from '@/components/admin/calendar-toolbar';
import { notifyError, notifySuccess } from '@/components/admin/notify';
import { PageHeader } from '@/components/admin/page-header';
import { ErrorState, TableSkeleton } from '@/components/admin/states';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiError } from '@/lib/api';
import {
  calendarRangeForDay,
  calendarRangeForWeek,
  isPastLocalDateTime,
} from '@/lib/admin/calendar';
import type { BookingsTab } from '@/lib/admin/bookings-tab';
import {
  prefetchCalendar,
  useBookingRequests,
  useCalendar,
  useUpdateBooking,
  type CalendarParams,
} from '@/lib/api/bookings';
import { useUserRoster } from '@/lib/api/users';

function calendarParamsFor(
  view: 'week' | 'day',
  anchorDate: string,
  mechanicFilter: string,
): CalendarParams {
  const range =
    view === 'day'
      ? calendarRangeForDay(anchorDate)
      : calendarRangeForWeek(anchorDate);
  return {
    from: range.from,
    to: range.to,
    ...(mechanicFilter === MECHANIC_FILTER_ALL
      ? {}
      : { userId: mechanicFilter }),
  };
}

/**
 * F8 — the calendar and booking-requests screen, replacing the read-only
 * placeholder two tables that stood in for it since F5/F6.
 */
export function BookingsCalendarPage({
  initialTab,
  initialDate,
  initialStatus,
}: {
  readonly initialTab: BookingsTab;
  readonly initialDate: string;
  readonly initialStatus?: StatusFilter;
}) {
  const [tab, setTab] = useState<BookingsTab>(initialTab);
  const [anchorDate, setAnchorDate] = useState(initialDate);
  const [mechanicFilter, setMechanicFilter] = useState<string>(
    MECHANIC_FILTER_ALL,
  );
  const [selectedBooking, setSelectedBooking] =
    useState<BookingWithRelations | null>(null);

  const queryClient = useQueryClient();
  const rosterQuery = useUserRoster();
  const unhandledQuery = useBookingRequests({ status: 'PENDING', limit: 1 });
  const updateBooking = useUpdateBooking();

  const view: 'week' | 'day' = tab === 'dag' ? 'day' : 'week';
  const calendarActive = tab !== 'forfragningar';
  const calendarParams = calendarParamsFor(view, anchorDate, mechanicFilter);
  const calendarQuery = useCalendar(calendarParams, {
    enabled: calendarActive,
  });
  const rangeDays =
    view === 'day' ? [anchorDate] : calendarRangeForWeek(anchorDate).days;

  // F8.5.1/F8.5.2 — only the visible range is fetched; the adjacent one is
  // warmed in the background so moving a step forward or back is instant.
  useEffect(() => {
    if (!calendarActive) {
      return;
    }
    const stepDays = view === 'day' ? 1 : 7;
    const neighbours = [
      addStockholmDays(anchorDate, stepDays),
      addStockholmDays(anchorDate, -stepDays),
    ];
    for (const neighbour of neighbours) {
      void prefetchCalendar(
        queryClient,
        calendarParamsFor(view, neighbour, mechanicFilter),
      );
    }
  }, [calendarActive, view, anchorDate, mechanicFilter, queryClient]);

  // The dashboard links to a specific day with `#booking-{id}` (F5). Once
  // that day's data has rendered, scroll the target into view.
  useEffect(() => {
    if (calendarQuery.data === undefined || typeof window === 'undefined') {
      return;
    }
    const hash = window.location.hash;
    if (hash.length <= 1) {
      return;
    }
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'center' });
  }, [calendarQuery.data]);

  async function handleReschedule(
    bookingId: string,
    day: string,
    mechanicId: string | null,
    startTime: string,
  ): Promise<void> {
    const booking = calendarQuery.data?.data.find(
      (candidate: BookingWithRelations) => candidate.id === bookingId,
    );
    if (booking === undefined) {
      return;
    }
    const localStart = `${day}T${startTime}`;
    // Defensive: the grid already refuses a drop on a past slot.
    if (isPastLocalDateTime(localStart)) {
      return;
    }
    const durationMs =
      new Date(booking.endsAt).getTime() - new Date(booking.startsAt).getTime();
    const startsAt = stockholmWallClockToUtc(localStart);
    const endsAt = new Date(startsAt.getTime() + durationMs);

    try {
      await updateBooking.mutateAsync({
        id: bookingId,
        input: {
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          assignedUserId: mechanicId,
        },
      });
      notifySuccess('Bokningen är flyttad.');
    } catch (error) {
      // `ApiError.message` already carries the exclusion constraint's own
      // Swedish explanation on a 409 (F8.2.4) — nothing to substitute.
      notifyError(error);
    }
  }

  const calendarError =
    calendarQuery.error === null
      ? null
      : calendarQuery.error instanceof ApiError
        ? calendarQuery.error
        : ApiError.invalidResponse('Kalendern kunde inte visas.');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={<span>Admin / Bokningar</span>}
        title="Bokningar"
        description="Bekräfta förfrågningar och planera veckan."
        actions={
          unhandledQuery.data === undefined ? null : (
            <Badge tone={unhandledQuery.data.unhandledCount > 0 ? 'hivis' : 'neutral'}>
              {unhandledQuery.data.unhandledCount} obehandlade förfrågningar
            </Badge>
          )
        }
      />

      <Tabs
        value={tab}
        onValueChange={(next: string) => {
          setTab(next as BookingsTab);
        }}
      >
        <TabsList>
          <TabsTrigger value="vecka">Vecka</TabsTrigger>
          <TabsTrigger value="dag">Dag</TabsTrigger>
          <TabsTrigger value="forfragningar">
            Förfrågningar
            {unhandledQuery.data === undefined || unhandledQuery.data.unhandledCount === 0
              ? ''
              : ` (${String(unhandledQuery.data.unhandledCount)})`}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'forfragningar' ? (
        <BookingRequestInbox
          {...(initialStatus === undefined ? {} : { initialStatus })}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <CalendarToolbar
            view={view}
            onViewChange={(nextView: 'week' | 'day') => {
              setTab(nextView === 'day' ? 'dag' : 'vecka');
            }}
            anchorDate={anchorDate}
            onAnchorDateChange={setAnchorDate}
            mechanics={rosterQuery.data?.data ?? []}
            mechanicFilter={mechanicFilter}
            onMechanicFilterChange={setMechanicFilter}
          />

          {calendarError !== null ? (
            <ErrorState
              message={calendarError.message}
              onRetry={() => {
                void calendarQuery.refetch();
              }}
              {...(calendarError.requestId === undefined
                ? {}
                : { requestId: calendarError.requestId })}
            />
          ) : calendarQuery.isPending ? (
            <TableSkeleton rows={8} columns={4} />
          ) : (
            <CalendarGrid
              days={rangeDays}
              mechanics={rosterQuery.data?.data ?? []}
              bookings={calendarQuery.data?.data ?? []}
              dense={view === 'day'}
              onBookingClick={setSelectedBooking}
              onReschedule={(...args) => {
                void handleReschedule(...args);
              }}
            />
          )}
        </div>
      )}

      {selectedBooking === null ? null : (
        <BookingDetailDialog
          key={selectedBooking.id}
          booking={selectedBooking}
          open
          onOpenChange={(open: boolean) => {
            if (!open) {
              setSelectedBooking(null);
            }
          }}
        />
      )}
    </div>
  );
}
