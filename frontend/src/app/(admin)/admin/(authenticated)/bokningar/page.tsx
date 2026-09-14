import { CalendarDaysIcon, InboxIcon } from 'lucide-react';
import {
  bookingRequestListResponseSchema,
  dashboardSchema,
  type BookingRequest,
  type BookingWithRelations,
} from 'shared';
import { PageHeader } from '@/components/admin/page-header';
import {
  ReadOnlyTable,
  type ReadOnlyColumn,
} from '@/components/admin/read-only-table';
import { bookingRequestStatus, bookingStatus } from '@/components/admin/status';
import { StatusBadge } from '@/components/admin/status-badge';
import { EmptyState } from '@/components/admin/states';
import { Badge } from '@/components/ui/badge';
import { apiFetchServer } from '@/lib/api/server';
import {
  firstSearchParam,
  type AdminSearchParams,
} from '@/lib/admin/search-params';
import { formatDateOnly, formatTime } from '@/lib/format/date';

function dashboardPath(date: string | undefined): string {
  if (date === undefined) {
    return '/dashboard';
  }

  const params = new URLSearchParams({ date });
  return `/dashboard?${params.toString()}`;
}

function bookingRequestsPath(status: string | undefined): string {
  const params = new URLSearchParams({ limit: '20' });
  if (status !== undefined) {
    params.set('status', status);
  }
  return `/booking-requests?${params.toString()}`;
}

const requestColumns: readonly ReadOnlyColumn<BookingRequest>[] = [
  {
    header: 'Kund',
    cell: (request: BookingRequest) => (
      <span className="block min-w-0">
        <span className="block truncate font-medium">
          {request.customerName}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {request.phone}
        </span>
      </span>
    ),
  },
  {
    header: 'Regnr',
    cell: (request: BookingRequest) => (
      <span className="tabular-nums">{request.regNr ?? 'Saknas'}</span>
    ),
  },
  {
    header: 'Önskat datum',
    cell: (request: BookingRequest) =>
      request.requestedDate === null
        ? 'Flexibelt'
        : formatDateOnly(request.requestedDate),
  },
  {
    header: 'Status',
    cell: (request: BookingRequest) => (
      <StatusBadge status={bookingRequestStatus(request.status)} />
    ),
  },
];

const bookingColumns: readonly ReadOnlyColumn<BookingWithRelations>[] = [
  {
    header: 'Tid',
    cell: (booking: BookingWithRelations) => (
      <span id={`booking-${booking.id}`} className="tabular-nums">
        {formatTime(booking.startsAt)}-{formatTime(booking.endsAt)}
      </span>
    ),
  },
  {
    header: 'Fordon',
    cell: (booking: BookingWithRelations) =>
      booking.vehicle === null
        ? 'Fordon saknas'
        : `${booking.vehicle.registrationNumberDisplay} · ${booking.vehicle.make} ${booking.vehicle.model}`,
  },
  {
    header: 'Kund',
    cell: (booking: BookingWithRelations) => booking.customer.name,
  },
  {
    header: 'Mekaniker',
    cell: (booking: BookingWithRelations) =>
      booking.assignedUser === null
        ? 'Ej tilldelad'
        : booking.assignedUser.name,
  },
  {
    header: 'Status',
    cell: (booking: BookingWithRelations) => (
      <StatusBadge status={bookingStatus(booking.status)} />
    ),
  },
];

export default async function BookingsPage({
  searchParams,
}: {
  readonly searchParams: Promise<AdminSearchParams>;
}) {
  const params = await searchParams;
  const view = firstSearchParam(params, 'vy');
  const status = firstSearchParam(params, 'status');

  if (view === 'forfragningar') {
    const response = await apiFetchServer(
      bookingRequestsPath(status),
      bookingRequestListResponseSchema,
    );

    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          breadcrumb={<span>Admin / Bokningar</span>}
          title="Bokningar"
          description="Förfrågningar som väntar på besked."
          actions={
            <Badge tone="hivis">{response.unhandledCount} obehandlade</Badge>
          }
        />
        <ReadOnlyTable
          rows={response.data}
          columns={requestColumns}
          rowKey={(request: BookingRequest) => request.id}
          caption="Bokningsförfrågningar"
          empty={
            <EmptyState
              icon={InboxIcon}
              message="Inga förfrågningar matchar filtret."
            />
          }
        />
      </div>
    );
  }

  const date = firstSearchParam(params, 'date');
  const dashboard = await apiFetchServer(dashboardPath(date), dashboardSchema);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={<span>Admin / Bokningar</span>}
        title="Bokningar"
        description={`Bokningar för ${formatDateOnly(dashboard.date)}.`}
        actions={
          <Badge tone="neutral">{dashboard.todaysBookings.length} tider</Badge>
        }
      />
      <ReadOnlyTable
        rows={dashboard.todaysBookings}
        columns={bookingColumns}
        rowKey={(booking: BookingWithRelations) => booking.id}
        caption="Dagens bokningar"
        empty={
          <EmptyState
            icon={CalendarDaysIcon}
            message="Inga bokningar matchar datumet."
          />
        }
      />
    </div>
  );
}
