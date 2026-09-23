'use client';

import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useSearchParams } from 'next/navigation';
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
import { useMatchMedia } from '@/lib/admin/use-match-media';
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
 * Below this width the week view is seven columns in a 390 px viewport, so
 * the day view is the useful default (UI_UX_AUDIT C3). Matches Tailwind's
 * `md`, which is where the rest of the admin switches to its compact layout.
 */
const DAY_VIEW_MAX_WIDTH = '(max-width: 767px)';

/**
 * F8 — the calendar and booking-requests screen, replacing the read-only
 * placeholder two tables that stood in for it since F5/F6.
 */
export function BookingsCalendarPage({
  initialTab,
  tabWasRequested = false,
  initialDate,
  initialStatus,
}: {
  readonly initialTab: BookingsTab;
  /** `?vy=` was in the URL, so the view is the user's choice, not a default. */
  readonly tabWasRequested?: boolean;
  readonly initialDate: string;
  readonly initialStatus?: StatusFilter;
}) {
  /*
   * `null` until the user picks a view, so the default can stay *derived*
   * rather than written into state by an effect on mount. On a phone the
   * week view is seven columns in 390 px, so the day view is the useful
   * default — unless the URL asked for a view, which is a real choice
   * (UI_UX_AUDIT C3).
   */
  const [chosenTab, setChosenTab] = useState<BookingsTab | null>(null);
  const prefersDayView = useMatchMedia(DAY_VIEW_MAX_WIDTH);
  const tab: BookingsTab =
    chosenTab ??
    (!tabWasRequested && prefersDayView && initialTab === 'vecka'
      ? 'dag'
      : initialTab);
  const setTab = setChosenTab;
  const [anchorDate, setAnchorDate] = useState(initialDate);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mechanicFilter, setMechanicFilter] =
    useState<string>(MECHANIC_FILTER_ALL);
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

  /*
   * Keep `?vy=` and `?date=` in the address bar (UI_UX_AUDIT C4).
   *
   * Both were already *read* on load, but clicking Vecka / Dag /
   * Förfrågningar never wrote them back, so a reload, the back button or a
   * link pasted to a colleague all landed on the default view.
   *
   * `window.history.replaceState`, not `router.replace`: the view is already
   * client state and the server has nothing new to render, so a router
   * navigation would cost an RSC round-trip on every tab click and every
   * step through the week for a URL that is only there to be copied and
   * reloaded. Next's App Router supports this shallow update and keeps
   * `useSearchParams` in step with it. `replace` rather than `push` either
   * way: switching tab is not something the back button should have to step
   * through twice.
   */
  useEffect(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.set('vy', tab);
    if (tab === 'forfragningar') {
      next.delete('date');
    } else {
      next.set('date', anchorDate);
    }
    const query = next.toString();
    if (query !== searchParams.toString()) {
      window.history.replaceState(null, '', `${pathname}?${query}`);
    }
  }, [tab, anchorDate, pathname, searchParams]);

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
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'Bokningar' },
        ]}
        title="Bokningar"
        description="Bekräfta förfrågningar och planera veckan."
        /*
         * No count badge here. The unhandled-request count already appears
         * in the sidebar, in the "Förfrågningar" tab label and on the
         * inbox's own status filter — four times on one screen said nothing
         * the first one did not (UI_UX_AUDIT C5).
         */
      />

      <section className="flex flex-col gap-4 rounded-sharp border border-border bg-card/45 p-3 lg:flex-row lg:items-end">
        {/* Labelled like the date and mechanic controls beside it, so the
            three groups share one baseline instead of one floating
            unlabelled (UI_UX_AUDIT C5). */}
        <Tabs
          value={tab}
          onValueChange={(next: string) => {
            setTab(next as BookingsTab);
          }}
          className="flex shrink-0 flex-col gap-1.5"
        >
          <span className="text-xs font-medium text-muted-foreground">Vy</span>
          <TabsList>
            <TabsTrigger value="vecka">Vecka</TabsTrigger>
            <TabsTrigger value="dag">Dag</TabsTrigger>
            <TabsTrigger value="forfragningar">
              Förfrågningar
              {unhandledQuery.data === undefined ||
              unhandledQuery.data.unhandledCount === 0
                ? ''
                : ` (${String(unhandledQuery.data.unhandledCount)})`}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {calendarActive ? (
          <div className="min-w-0 flex-1">
            <CalendarToolbar
              view={view}
              anchorDate={anchorDate}
              onAnchorDateChange={setAnchorDate}
              mechanics={rosterQuery.data?.data ?? []}
              mechanicFilter={mechanicFilter}
              onMechanicFilterChange={setMechanicFilter}
            />
          </div>
        ) : null}
      </section>

      {tab === 'forfragningar' ? (
        <BookingRequestInbox
          {...(initialStatus === undefined ? {} : { initialStatus })}
        />
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
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
