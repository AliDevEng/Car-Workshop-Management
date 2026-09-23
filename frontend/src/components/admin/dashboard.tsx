'use client';

import {
  BoxesIcon,
  CalendarDaysIcon,
  CarFrontIcon,
  CheckCircle2Icon,
  PlusIcon,
  RefreshCwIcon,
  TimerIcon,
  WrenchIcon,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import {
  stockholmDate,
  type BookingWithRelations,
  type Dashboard,
} from 'shared';
import {
  IconTile,
  accentEdge,
  accentInk,
  accentSurface,
  type Accent,
} from '@/components/admin/accent';
import { useCurrentUser } from '@/components/admin/current-user';
import { bookingStatus } from '@/components/admin/status';
import { StatusBadge } from '@/components/admin/status-badge';
import { EmptyState, ErrorState } from '@/components/admin/states';
import { DatePicker } from '@/components/form/date-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { useDashboard } from '@/lib/api/dashboard';
import {
  formatDateOnly,
  formatTime,
  formatWeekdayDate,
} from '@/lib/format/date';
import { cn } from '@/lib/utils';
import { PageHeader } from './page-header';

type DashboardData = Dashboard | undefined;

const bookingRequestsHref = '/admin/bokningar?vy=forfragningar&status=PENDING';
const awaitingPartsHref = '/admin/arbetsordrar?status=AWAITING_PARTS';
const readyForPickupHref = '/admin/arbetsordrar?status=READY_FOR_PICKUP';
const inspectionsHref = '/admin/fordon?besiktning=60-dagar';
const lowStockHref = '/admin/lager?lowStock=true';

function dashboardError(error: unknown): ApiError {
  return error instanceof ApiError
    ? error
    : ApiError.invalidResponse('Dashboarden kunde inte visas.');
}

function bookingHref(
  booking: BookingWithRelations,
  dashboardDate: string,
): string {
  if (booking.status === 'IN_PROGRESS' || booking.status === 'DONE') {
    return `/admin/arbetsordrar?bookingId=${encodeURIComponent(booking.id)}#booking-${booking.id}`;
  }

  const params = new URLSearchParams({ date: dashboardDate });
  return `/admin/bokningar?${params.toString()}#booking-${booking.id}`;
}

function vehicleLabel(booking: BookingWithRelations): string {
  if (booking.vehicle === null) {
    return 'Fordon saknas';
  }

  return `${booking.vehicle.registrationNumberDisplay} · ${booking.vehicle.make} ${booking.vehicle.model}`;
}

/** The first name, for the greeting. A single-word name is its own first name. */
function firstName(name: string): string {
  const [first = ''] = name.trim().split(/\s+/);
  return first;
}

/**
 * A white work panel: the surfaces the day is actually read and worked in.
 *
 * Depth comes from the pale canvas underneath rather than from a border on
 * every edge (ADMIN_PANEL_REDESIGN.md §10.3), so the panels group content
 * without the "everything is a card of equal weight" flatness of the previous
 * layout (R10).
 */
function Panel({
  title,
  description,
  icon,
  accent,
  action,
  children,
  className,
}: {
  readonly title: string;
  readonly description?: string;
  readonly icon: LucideIcon;
  readonly accent: Accent;
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <section
      className={cn(
        'flex min-w-0 flex-col gap-4 rounded-soft bg-card p-4 shadow-sm ring-1 ring-border sm:p-5',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <IconTile icon={icon} accent={accent} />
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-base leading-snug font-medium">
            {title}
          </h2>
          {description === undefined ? null : (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {action === undefined ? null : <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

function RowSkeleton({ rows = 3 }: { readonly rows?: number }) {
  return (
    <div
      aria-busy="true"
      aria-label="Laddar"
      className="flex flex-col gap-3 py-1"
    >
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="grid min-h-11 grid-cols-[1fr_80px] gap-3">
          <div className="flex flex-col justify-center gap-2">
            <Skeleton className="h-4 w-3/4 rounded-sharp" />
            <Skeleton className="h-3 w-1/2 rounded-sharp" />
          </div>
          <Skeleton className="h-7 w-full self-center rounded-sharp" />
        </div>
      ))}
    </div>
  );
}

function FailedPanel({
  error,
  onRetry,
}: {
  readonly error: ApiError;
  readonly onRetry: () => void;
}) {
  return (
    <ErrorState
      message={error.message}
      onRetry={onRetry}
      className="py-6"
      {...(error.requestId === undefined ? {} : { requestId: error.requestId })}
    />
  );
}

/**
 * One pastel operational summary (ADMIN_PANEL_REDESIGN.md §5.1).
 *
 * The category colour says which part of the workshop the number belongs to;
 * it is not a status. The wording carries the state — a card reading `0` says
 * "Inget väntar just nu" rather than going grey and looking broken, and one
 * with work in it names what opening the card will show.
 */
function SummaryCard({
  href,
  label,
  hint,
  count,
  icon,
  accent,
  isLoading,
}: {
  readonly href: string;
  readonly label: string;
  readonly hint: string;
  readonly count: number | undefined;
  readonly icon: LucideIcon;
  readonly accent: Accent;
  readonly isLoading: boolean;
}) {
  const Icon = icon;

  return (
    <Link
      href={href}
      className={cn(
        'group/summary flex min-h-28 min-w-0 flex-col justify-between gap-3 rounded-soft border p-4',
        accentSurface(accent),
        accentEdge(accent),
        'transition-shadow hover:shadow-md focus-visible:shadow-md',
      )}
    >
      <span className="flex items-start justify-between gap-3">
        {/* Wraps rather than truncates: in a narrow column these became
            "Besiktning i…" and "Artiklar und…", which is not a label
            (UI_UX_AUDIT H1). */}
        <span className="min-w-0 text-sm font-medium text-balance text-foreground">
          {label}
        </span>
        <span className="grid size-10 shrink-0 place-items-center rounded-soft bg-card">
          <Icon
            aria-hidden="true"
            className={cn('size-5', accentInk(accent))}
          />
        </span>
      </span>
      <span className="flex items-baseline gap-2">
        {isLoading || count === undefined ? (
          <Skeleton className="h-8 w-12 rounded-sharp" />
        ) : (
          <span className="type-display text-3xl font-semibold tabular-nums text-foreground">
            {count}
          </span>
        )}
        <span className="min-w-0 text-xs text-muted-foreground">
          {count === 0 ? 'Inget väntar just nu' : hint}
        </span>
      </span>
    </Link>
  );
}

function SummaryRow({
  data,
  isLoading,
}: {
  readonly data: DashboardData;
  readonly isLoading: boolean;
}) {
  return (
    /*
     * Four across on a roomy desktop, two on a tablet, one on a phone. Sized
     * by the container rather than the viewport, because this row also has to
     * survive being narrowed by a future context column.
     */
    <div className="@container">
      <div className="grid gap-3 @md:grid-cols-2 @4xl:grid-cols-4">
        <SummaryCard
          href={bookingRequestsHref}
          label="Obehandlade förfrågningar"
          hint="Öppna inkorgen"
          count={data?.unhandledBookingRequests}
          icon={TimerIcon}
          accent="amber"
          isLoading={isLoading}
        />
        <SummaryCard
          href="/admin/bokningar"
          label="Bokningar den här dagen"
          hint="Öppna planeringen"
          count={data?.todaysBookings.length}
          icon={CalendarDaysIcon}
          accent="blue"
          isLoading={isLoading}
        />
        <SummaryCard
          href={awaitingPartsHref}
          label="Väntar på delar"
          hint="Öppna arbetsordrarna"
          count={data?.awaitingParts}
          icon={WrenchIcon}
          accent="peach"
          isLoading={isLoading}
        />
        <SummaryCard
          href={readyForPickupHref}
          label="Klara för hämtning"
          hint="Ring kunden"
          count={data?.readyForPickup}
          icon={CheckCircle2Icon}
          accent="mint"
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}

function TodayBookings({
  data,
  isLoading,
  error,
  onRetry,
}: {
  readonly data: DashboardData;
  readonly isLoading: boolean;
  readonly error: ApiError | null;
  readonly onRetry: () => void;
}) {
  if (isLoading) {
    return <RowSkeleton rows={4} />;
  }

  if (error !== null) {
    return <FailedPanel error={error} onRetry={onRetry} />;
  }

  const bookings = data?.todaysBookings ?? [];
  const dashboardDate = data?.date ?? '';
  if (bookings.length === 0) {
    return (
      <EmptyState
        icon={CalendarDaysIcon}
        /*
         * It used to add "Verkstaden kan ta den i lugn ordning", which the
         * data does not support: an empty schedule says nothing about the
         * request inbox or the orders already in the workshop (R02).
         */
        message="Inga bokningar ligger på den här dagen."
        action={
          <Button asChild variant="secondary" size="sm">
            <Link href="/admin/bokningar">Öppna planeringen</Link>
          </Button>
        }
        className="py-8"
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {bookings.map((booking) => (
        <Link
          key={booking.id}
          href={bookingHref(booking, dashboardDate)}
          className={cn(
            'grid min-h-16 grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-3 rounded-sharp border border-border px-3 py-2',
            'hover:bg-accent focus-visible:bg-accent',
          )}
        >
          <span className="text-sm font-medium tabular-nums">
            {formatTime(booking.startsAt)}-{formatTime(booking.endsAt)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">
              {vehicleLabel(booking)}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {booking.customer.name} ·{' '}
              {booking.assignedUser === null
                ? 'Ej tilldelad'
                : booking.assignedUser.name}
            </span>
          </span>
          <StatusBadge status={bookingStatus(booking.status)} />
        </Link>
      ))}
    </div>
  );
}

function Inspections({
  data,
  isLoading,
  error,
  onRetry,
}: {
  readonly data: DashboardData;
  readonly isLoading: boolean;
  readonly error: ApiError | null;
  readonly onRetry: () => void;
}) {
  if (isLoading) {
    return <RowSkeleton rows={3} />;
  }

  if (error !== null) {
    return <FailedPanel error={error} onRetry={onRetry} />;
  }

  const inspections = data?.inspectionsDueSoon ?? [];
  const inspectionsDueSoonCount = data?.inspectionsDueSoonCount ?? 0;
  const hiddenInspectionCount = Math.max(
    0,
    inspectionsDueSoonCount - inspections.length,
  );

  if (inspections.length === 0) {
    return (
      <EmptyState
        icon={CarFrontIcon}
        message="Inga fordon i registret har besiktning nära nog för dagens ringlista."
        action={
          <Button asChild variant="secondary" size="sm">
            <Link href={inspectionsHref}>Öppna besiktningslistan</Link>
          </Button>
        }
        className="py-7"
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {inspections.slice(0, 5).map((vehicle) => (
        <Link
          key={vehicle.id}
          href={`${inspectionsHref}#vehicle-${vehicle.id}`}
          className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-sharp border border-border px-3 py-2 hover:bg-accent focus-visible:bg-accent"
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">
              {vehicle.registrationNumberDisplay} · {vehicle.make}{' '}
              {vehicle.model}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {vehicle.customer === null
                ? 'Ingen kund kopplad'
                : vehicle.customer.name}
            </span>
          </span>
          <span className="text-sm tabular-nums">
            {formatDateOnly(vehicle.nextInspectionDueDate)}
          </span>
        </Link>
      ))}
      {/*
       * Always a way through to the full filtered list, not only when the
       * five shown rows hide something. The previous layout reached that page
       * through a count tile that this panel replaced, and losing the route
       * would have been a silent regression.
       */}
      <Button asChild variant="link" size="sm" className="self-start px-0">
        <Link href={inspectionsHref}>
          {hiddenInspectionCount > 0
            ? `Visa ${String(hiddenInspectionCount)} till`
            : 'Öppna besiktningslistan'}
        </Link>
      </Button>
    </div>
  );
}

function LowStock({
  data,
  isLoading,
  error,
}: {
  readonly data: DashboardData;
  readonly isLoading: boolean;
  readonly error: ApiError | null;
}) {
  if (isLoading || error !== null) {
    return <RowSkeleton rows={1} />;
  }

  const lowStockArticles = data?.lowStockArticles ?? 0;

  /*
   * A link at every count, including zero. It is the dashboard's only route
   * into the shortage list, and a row that disappears when the number is 0
   * takes the route with it — the count is the news, not the link.
   */
  return (
    <Link
      href={lowStockHref}
      className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-sharp border border-border px-3 py-2 hover:bg-accent focus-visible:bg-accent"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-balance">
          Artiklar under minsta saldo
        </span>
        <span className="block text-xs text-muted-foreground">
          {lowStockArticles === 0
            ? 'Inget behöver fyllas på just nu.'
            : 'Öppna bristlistan.'}
        </span>
      </span>
      <Badge
        tone={lowStockArticles === 0 ? 'neutral' : 'hivis'}
        className="tabular-nums"
      >
        {lowStockArticles}
      </Badge>
    </Link>
  );
}

export function DashboardOverview() {
  // Greeting only. Identity and permissions stay with the server.
  const user = useCurrentUser();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const dashboardQuery = useDashboard(selectedDate);
  const error =
    dashboardQuery.error === null ? null : dashboardError(dashboardQuery.error);
  const resolvedDate = dashboardQuery.data?.date ?? selectedDate;
  const isToday =
    resolvedDate === null || resolvedDate === stockholmDate(new Date());

  function retryDashboard(): void {
    void dashboardQuery.refetch();
  }

  const heading =
    resolvedDate === null
      ? 'Idag'
      : `${isToday ? 'Idag · ' : ''}${formatWeekdayDate(resolvedDate)}`;
  const greetingName = firstName(user.name);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        /*
         * No breadcrumb. "Admin / Översikt" above the panel's own front page
         * is a navigation step to nowhere (ADMIN_PANEL_REDESIGN.md §4.2).
         */
        {...(greetingName === '' ? {} : { eyebrow: `Hej ${greetingName}!` })}
        title={heading}
        description={
          /*
           * The counts below describe the *current* queues; only the schedule
           * follows the selected date. Saying so keeps a historical date from
           * looking like a snapshot of that day's inbox (§5.2).
           */
          isToday
            ? 'Dagens schema, väntande förfrågningar och jobb som behöver ett nästa steg.'
            : 'Schemat gäller den valda dagen. Räknarna visar köerna som de ser ut just nu.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              disabled={selectedDate === null}
              onClick={() => {
                setSelectedDate(null);
              }}
            >
              Idag
            </Button>
            <label className="sr-only" htmlFor="dashboard-date">
              Välj datum
            </label>
            <DatePicker
              id="dashboard-date"
              value={resolvedDate}
              className="w-[210px]"
              onChange={(nextValue) => {
                setSelectedDate(nextValue);
              }}
              disablePast={false}
            />
            <Button
              type="button"
              variant="secondary"
              size="icon-lg"
              onClick={retryDashboard}
              isPending={dashboardQuery.isFetching}
            >
              <RefreshCwIcon aria-hidden="true" />
              <span className="sr-only">Uppdatera dashboard</span>
            </Button>
            {/*
             * The warm principal action (§10.1). It opens the planning page,
             * where the booking form and the day's availability already live
             * — deep-linking straight into the open dialog needs a URL
             * parameter, and F13.1 owns that vocabulary.
             */}
            <Button asChild size="lg">
              <Link href="/admin/bokningar">
                <PlusIcon aria-hidden="true" />
                Ny bokning
              </Link>
            </Button>
          </div>
        }
      />

      <SummaryRow
        data={dashboardQuery.data}
        isLoading={dashboardQuery.isPending}
      />

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel
          title="Dagens planering"
          description="Tiderna visas i verkstadens Stockholmstid."
          icon={CalendarDaysIcon}
          accent="blue"
          action={
            dashboardQuery.data === undefined ? null : (
              <Badge tone="neutral" className="tabular-nums">
                {dashboardQuery.data.todaysBookings.length}{' '}
                {dashboardQuery.data.todaysBookings.length === 1
                  ? 'bokning'
                  : 'bokningar'}
              </Badge>
            )
          }
        >
          <TodayBookings
            data={dashboardQuery.data}
            isLoading={dashboardQuery.isPending}
            error={error}
            onRetry={retryDashboard}
          />
        </Panel>

        <div className="grid min-w-0 gap-4 lg:grid-cols-2 xl:grid-cols-1">
          <Panel
            title="Besiktning inom 60 dagar"
            description="Ringlistan, med närmaste datum först."
            icon={CarFrontIcon}
            accent="teal"
            action={
              dashboardQuery.data === undefined ? null : (
                <Badge
                  tone={
                    dashboardQuery.data.inspectionsDueSoonCount === 0
                      ? 'neutral'
                      : 'hivis'
                  }
                  className="tabular-nums"
                >
                  {dashboardQuery.data.inspectionsDueSoonCount}
                </Badge>
              )
            }
          >
            <Inspections
              data={dashboardQuery.data}
              isLoading={dashboardQuery.isPending}
              error={error}
              onRetry={retryDashboard}
            />
          </Panel>

          <Panel
            title="Lager"
            description="Artiklar som behöver fyllas på."
            icon={BoxesIcon}
            accent="amber"
          >
            <LowStock
              data={dashboardQuery.data}
              isLoading={dashboardQuery.isPending}
              error={error}
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}
