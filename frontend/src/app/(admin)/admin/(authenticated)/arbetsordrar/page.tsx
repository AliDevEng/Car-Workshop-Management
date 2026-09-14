import { ClipboardListIcon } from 'lucide-react';
import { workOrderListResponseSchema, type WorkOrderListItem } from 'shared';
import { PageHeader } from '@/components/admin/page-header';
import {
  ReadOnlyTable,
  type ReadOnlyColumn,
} from '@/components/admin/read-only-table';
import { workOrderStatus } from '@/components/admin/status';
import { StatusBadge } from '@/components/admin/status-badge';
import { EmptyState } from '@/components/admin/states';
import { Badge } from '@/components/ui/badge';
import { apiFetchServer } from '@/lib/api/server';
import {
  firstSearchParam,
  type AdminSearchParams,
} from '@/lib/admin/search-params';

function workOrdersPath(params: AdminSearchParams): string {
  const query = new URLSearchParams({ limit: '20' });
  const status = firstSearchParam(params, 'status');
  const bookingId = firstSearchParam(params, 'bookingId');

  if (status !== undefined) {
    query.set('status', status);
  }
  if (bookingId !== undefined) {
    query.set('bookingId', bookingId);
  }

  return `/work-orders?${query.toString()}`;
}

const columns: readonly ReadOnlyColumn<WorkOrderListItem>[] = [
  {
    header: 'Arbetsorder',
    cell: (order: WorkOrderListItem) => (
      <span
        id={order.bookingId === null ? undefined : `booking-${order.bookingId}`}
        className="block min-w-0"
      >
        <span className="block truncate font-medium">
          {order.number ?? 'Utkast'}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {order.description}
        </span>
      </span>
    ),
  },
  {
    header: 'Fordon',
    cell: (order: WorkOrderListItem) =>
      `${order.vehicle.registrationNumberDisplay} · ${order.vehicle.make} ${order.vehicle.model}`,
  },
  { header: 'Kund', cell: (order: WorkOrderListItem) => order.customer.name },
  {
    header: 'Mekaniker',
    cell: (order: WorkOrderListItem) =>
      order.assignedUser === null ? 'Ej tilldelad' : order.assignedUser.name,
  },
  {
    header: 'Status',
    cell: (order: WorkOrderListItem) => (
      <StatusBadge status={workOrderStatus(order.status)} />
    ),
  },
];

export default async function WorkOrdersPage({
  searchParams,
}: {
  readonly searchParams: Promise<AdminSearchParams>;
}) {
  const params = await searchParams;
  const response = await apiFetchServer(
    workOrdersPath(params),
    workOrderListResponseSchema,
  );
  const status = firstSearchParam(params, 'status');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={<span>Admin / Arbetsordrar</span>}
        title="Arbetsordrar"
        description="Arbetsordrar som matchar det valda filtret."
        actions={
          status === undefined ? undefined : (
            <Badge tone="neutral">{status}</Badge>
          )
        }
      />
      <ReadOnlyTable
        rows={response.data}
        columns={columns}
        rowKey={(order: WorkOrderListItem) => order.id}
        caption="Arbetsordrar"
        empty={
          <EmptyState
            icon={ClipboardListIcon}
            message="Inga arbetsordrar matchar filtret."
          />
        }
      />
    </div>
  );
}
