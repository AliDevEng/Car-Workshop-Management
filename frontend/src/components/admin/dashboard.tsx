'use client';

import {
  AlertTriangleIcon,
  CalendarDaysIcon,
  CarFrontIcon,
  CheckCircle2Icon,
  ClipboardListIcon,
  PackageSearchIcon,
  RefreshCwIcon,
  TimerIcon,
  WrenchIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type { BookingWithRelations, Dashboard } from 'shared';
import { bookingStatus } from '@/components/admin/status';
import { StatusBadge } from '@/components/admin/status-badge';
import { EmptyState, ErrorState } from '@/components/admin/states';
import { DatePicker } from '@/components/form/date-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { useDashboard } from '@/lib/api/dashboard';
import { formatDateOnly, formatTime } from '@/lib/format/date';
import { cn } from '@/lib/utils';
import { PageHeader } from './page-header';

type DashboardData = Dashboard | undefined;
type DashboardIcon = typeof CalendarDaysIcon;

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

function DashboardCard({
  title,
  description,
  icon: Icon,
  action,
  children,
  className,
}: {
  readonly title: string;
  readonly description: string;
  readonly icon: DashboardIcon;
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <Card className={cn('min-h-48 rounded-soft', className)}>
      <CardHeader className="gap-2">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-sharp border border-border bg-background/40">
            <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
          </span>
          <div className="min-w-0">
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
        {action === undefined ? null : <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function CardSkeleton({ rows = 3 }: { readonly rows?: number }) {
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

function FailedCard({
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

function CountLink({
  href,
  label,
  count,
  icon: Icon,
  tone,
}: {
  readonly href: string;
  readonly label: string;
  readonly count: number;
  readonly icon: DashboardIcon;
  readonly tone: 'neutral' | 'signal' | 'hivis' | 'oxide' | 'moss';
}) {
  return (
    <Button
      asChild
      variant="secondary"
      className="h-auto min-h-24 justify-start p-4 text-left"
    >
      <Link href={href} className="w-full">
        <span className="flex min-w-0 items-start gap-3">
          <Icon
            aria-hidden="true"
            className="mt-0.5 size-5 text-muted-foreground"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{label}</span>
            <span className="mt-2 flex items-baseline gap-2">
              <span className="type-display text-3xl font-semibold tabular-nums">
                {count}
              </span>
              <Badge tone={tone}>
                {count === 0 ? 'Inget väntar' : 'Öppna'}
              </Badge>
            </span>
          </span>
        </span>
      </Link>
    </Button>
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
    return <CardSkeleton rows={4} />;
  }

  if (error !== null) {
    return <FailedCard error={error} onRetry={onRetry} />;
  }

  const bookings = data?.todaysBookings ?? [];
  const dashboardDate = data?.date ?? '';
  if (bookings.length === 0) {
    return (
      <EmptyState
        icon={CalendarDaysIcon}
        message="Inga bokningar ligger på den här dagen. Verkstaden kan ta den i lugn ordning."
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

function Actions({
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
    return <CardSkeleton rows={3} />;
  }

  if (error !== null) {
    return <FailedCard error={error} onRetry={onRetry} />;
  }

  const unhandledBookingRequests = data?.unhandledBookingRequests ?? 0;
  const awaitingParts = data?.awaitingParts ?? 0;
  const readyForPickup = data?.readyForPickup ?? 0;

  return (
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-1">
      <CountLink
        href={bookingRequestsHref}
        label="Obehandlade förfrågningar"
        count={unhandledBookingRequests}
        icon={TimerIcon}
        tone={unhandledBookingRequests === 0 ? 'neutral' : 'hivis'}
      />
      <CountLink
        href={awaitingPartsHref}
        label="Väntar på delar"
        count={awaitingParts}
        icon={WrenchIcon}
        tone={awaitingParts === 0 ? 'neutral' : 'hivis'}
      />
      <CountLink
        href={readyForPickupHref}
        label="Klara för hämtning"
        count={readyForPickup}
        icon={CheckCircle2Icon}
        tone={readyForPickup === 0 ? 'neutral' : 'moss'}
      />
    </div>
  );
}

function Attention({
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
    return <CardSkeleton rows={4} />;
  }

  if (error !== null) {
    return <FailedCard error={error} onRetry={onRetry} />;
  }

  const inspections = data?.inspectionsDueSoon ?? [];
  const inspectionsDueSoonCount = data?.inspectionsDueSoonCount ?? 0;
  const lowStockArticles = data?.lowStockArticles ?? 0;
  const hiddenInspectionCount = Math.max(
    0,
    inspectionsDueSoonCount - inspections.length,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <CountLink
          href={inspectionsHref}
          label="Besiktning inom 60 dagar"
          count={inspectionsDueSoonCount}
          icon={CarFrontIcon}
          tone={inspectionsDueSoonCount === 0 ? 'neutral' : 'hivis'}
        />
        <CountLink
          href={lowStockHref}
          label="Artiklar under minsta saldo"
          count={lowStockArticles}
          icon={PackageSearchIcon}
          tone={lowStockArticles === 0 ? 'neutral' : 'hivis'}
        />
      </div>

      {inspections.length === 0 ? (
        <EmptyState
          icon={CarFrontIcon}
          message="Inga fordon i registret har besiktning nära nog för dagens ringlista."
          className="py-7"
        />
      ) : (
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
          {hiddenInspectionCount > 0 ? (
            <Button
              asChild
              variant="link"
              size="sm"
              className="self-start px-0"
            >
              <Link href={inspectionsHref}>
                Visa {hiddenInspectionCount} till
              </Link>
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function DashboardOverview() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const dashboardQuery = useDashboard(selectedDate);
  const error =
    dashboardQuery.error === null ? null : dashboardError(dashboardQuery.error);
  const resolvedDate = dashboardQuery.data?.date ?? selectedDate;

  function retryDashboard(): void {
    void dashboardQuery.refetch();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={<span>Admin / Översikt</span>}
        title="Adminpanelen"
        description={
          resolvedDate === null
            ? 'Dagens bokningar, väntande jobb och saker som behöver uppmärksamhet.'
            : `Översikt för ${formatDateOnly(resolvedDate)}.`
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
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
              optional
              disablePast={false}
            />
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={retryDashboard}
              isPending={dashboardQuery.isFetching}
            >
              <RefreshCwIcon aria-hidden="true" />
              <span className="sr-only">Uppdatera dashboard</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setSelectedDate(null);
              }}
            >
              Idag
            </Button>
          </div>
        }
      />

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <DashboardCard
          title="Dagens bokningar"
          description="Tiderna visas i verkstadens Stockholmstid."
          icon={CalendarDaysIcon}
          action={
            dashboardQuery.data === undefined ? null : (
              <Badge tone="neutral" className="tabular-nums">
                {dashboardQuery.data.todaysBookings.length} bokningar
              </Badge>
            )
          }
          className="xl:min-h-[520px]"
        >
          <TodayBookings
            data={dashboardQuery.data}
            isLoading={dashboardQuery.isPending}
            error={error}
            onRetry={retryDashboard}
          />
        </DashboardCard>

        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-1">
          <DashboardCard
            title="Att göra"
            description="Klicka vidare till listan som äger arbetet."
            icon={ClipboardListIcon}
          >
            <Actions
              data={dashboardQuery.data}
              isLoading={dashboardQuery.isPending}
              error={error}
              onRetry={retryDashboard}
            />
          </DashboardCard>

          <DashboardCard
            title="Uppmärksamhet"
            description="Besiktning och lager innan de blir akuta."
            icon={AlertTriangleIcon}
          >
            <Attention
              data={dashboardQuery.data}
              isLoading={dashboardQuery.isPending}
              error={error}
              onRetry={retryDashboard}
            />
          </DashboardCard>
        </div>
      </div>
    </div>
  );
}
