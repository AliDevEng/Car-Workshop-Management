'use client';

import { ClipboardListIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  WORK_ORDER_STATUSES,
  ore,
  stockholmDate,
  type WorkOrderListItem,
  type WorkOrderStatus,
} from 'shared';
import { CreateWorkOrderDialog } from '@/components/admin/create-work-order-dialog';
import { DataTable, type DataTableColumn } from '@/components/admin/data-table';
import { ListPage } from '@/components/admin/list-page';
import { PageHeader } from '@/components/admin/page-header';
import { workOrderStatus } from '@/components/admin/status';
import { StatusBadge } from '@/components/admin/status-badge';
import {
  EmptyState,
  ErrorState,
  TableSkeleton,
} from '@/components/admin/states';
import { DatePicker } from '@/components/form/date-picker';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ApiError } from '@/lib/api';
import { useUserRoster } from '@/lib/api/users';
import { useWorkOrders, type WorkOrderListParams } from '@/lib/api/work-orders';
import { formatCurrency } from '@/lib/format/currency';

const PAGE_SIZE = 25;
/**
 * `status` only ever filters to one backend enum value at a time (F9.1's own
 * API), so "active work" (several statuses at once) and a date range both
 * need a single, larger, client-filtered fetch instead — the same "report"
 * shape F7.5's low-stock view already uses for the same reason. Capped at
 * 100, `cursorQuerySchema`'s own maximum (`shared/src/schemas/common.ts`) —
 * a higher value is not a bigger report, it is a `400` on every load.
 */
const REPORT_LIMIT = 100;
const ALL = 'ALL' as const;
const ACTIVE = 'ACTIVE' as const;
const ALL_MECHANICS = 'ALL' as const;

type StatusFilter = typeof ALL | typeof ACTIVE | WorkOrderStatus;

const STATUS_FILTER_OPTIONS: readonly {
  readonly value: StatusFilter;
  readonly label: string;
}[] = [
  { value: ACTIVE, label: 'Aktivt arbete' },
  { value: ALL, label: 'Alla statusar' },
  ...WORK_ORDER_STATUSES.map((status) => ({
    value: status,
    label: workOrderStatus(status).label,
  })),
];

const ACTIVE_STATUSES = new Set<WorkOrderStatus>(
  WORK_ORDER_STATUSES.filter(
    (status) => status !== 'COMPLETED' && status !== 'CANCELLED',
  ),
);

/**
 * Compared as Stockholm-local calendar dates, not the UTC date `createdAt`
 * starts with (CLAUDE.md: local wall-clock time, not UTC) — a job created
 * just after midnight in Stockholm is still the previous UTC day for part of
 * the year, which would otherwise put it a day off from the date the picker
 * shows.
 */
function matchesDateRange(
  createdAt: string,
  dateFrom: string,
  dateTo: string,
): boolean {
  const date = stockholmDate(new Date(createdAt));
  if (dateFrom !== '' && date < dateFrom) {
    return false;
  }
  if (dateTo !== '' && date > dateTo) {
    return false;
  }
  return true;
}

const columns: readonly DataTableColumn<WorkOrderListItem>[] = [
  {
    id: 'number',
    header: 'Arbetsorder',
    cell: (order: WorkOrderListItem) => (
      // F5's dashboard links to `#booking-<id>` for a job that started from
      // a booking (`dashboard.tsx`'s `bookingHref`) — this id is what the
      // browser scrolls to on arrival.
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
    id: 'vehicle',
    header: 'Fordon',
    cell: (order: WorkOrderListItem) =>
      `${order.vehicle.registrationNumberDisplay} · ${order.vehicle.make} ${order.vehicle.model}`,
  },
  {
    id: 'customer',
    header: 'Kund',
    cell: (order: WorkOrderListItem) => order.customer.name,
  },
  {
    id: 'status',
    header: 'Status',
    cell: (order: WorkOrderListItem) => (
      <StatusBadge status={workOrderStatus(order.status)} />
    ),
  },
  {
    id: 'mechanic',
    header: 'Mekaniker',
    cell: (order: WorkOrderListItem) =>
      order.assignedUser === null ? 'Ej tilldelad' : order.assignedUser.name,
  },
  {
    id: 'total',
    header: 'Belopp',
    numeric: true,
    cell: (order: WorkOrderListItem) =>
      formatCurrency(ore(order.totals.roundedGrossOre)),
  },
];

function isWorkOrderStatus(value: string): value is WorkOrderStatus {
  return (WORK_ORDER_STATUSES as readonly string[]).includes(value);
}

/**
 * F9.1 — the work-order list, active work first (F9.1.3).
 *
 * `initialStatus`/`initialBookingId` seed the filter from a deep link — the
 * F5 dashboard's "Väntar på delar"/"Klar för upphämtning" cards and its
 * per-booking `#booking-<id>` link (`dashboard.tsx`'s `awaitingPartsHref`,
 * `readyForPickupHref` and `bookingHref`) all land here.
 */
export function WorkOrderListPage({
  initialStatus,
  initialBookingId,
}: {
  readonly initialStatus?: string;
  readonly initialBookingId?: string;
} = {}) {
  const router = useRouter();
  const rosterQuery = useUserRoster();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    initialStatus !== undefined && isWorkOrderStatus(initialStatus)
      ? initialStatus
      : ACTIVE,
  );
  const [assignedUserId, setAssignedUserId] = useState<string>(ALL_MECHANICS);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [cursorStack, setCursorStack] = useState<readonly string[]>([]);
  const [bookingId, setBookingId] = useState<string | undefined>(
    initialBookingId,
  );

  // `null` whenever the filter cannot be expressed as the backend's single
  // `status` enum value — `Aktivt arbete` and `Alla statusar` both span more
  // than one status. That is exactly when this screen falls back to report
  // mode, so the two are tested together below rather than as two separate,
  // independently-driftable conditions.
  const concreteStatus: WorkOrderStatus | null =
    statusFilter === ACTIVE || statusFilter === ALL ? null : statusFilter;
  const isReportMode =
    bookingId === undefined &&
    (concreteStatus === null || dateFrom !== '' || dateTo !== '');
  const cursor = cursorStack.at(-1);

  let queryParams: WorkOrderListParams;
  if (bookingId !== undefined) {
    // A deep link from a specific booking (F9.7.2): narrow to exactly that
    // job rather than applying the other filters at all.
    queryParams = { bookingId, limit: PAGE_SIZE };
  } else if (concreteStatus === null || isReportMode) {
    queryParams = {
      limit: REPORT_LIMIT,
      ...(assignedUserId === ALL_MECHANICS ? {} : { assignedUserId }),
    };
  } else {
    queryParams = {
      status: concreteStatus,
      limit: PAGE_SIZE,
      ...(cursor === undefined ? {} : { cursor }),
      ...(assignedUserId === ALL_MECHANICS ? {} : { assignedUserId }),
    };
  }
  const query = useWorkOrders(queryParams);

  const error =
    query.error === null
      ? null
      : query.error instanceof ApiError
        ? query.error
        : ApiError.invalidResponse('Arbetsorderlistan kunde inte visas.');

  const allRows = query.data?.data ?? [];
  const rows = isReportMode
    ? allRows.filter((order: WorkOrderListItem) => {
        if (statusFilter === ACTIVE && !ACTIVE_STATUSES.has(order.status)) {
          return false;
        }
        if (
          statusFilter !== ACTIVE &&
          statusFilter !== ALL &&
          order.status !== statusFilter
        ) {
          return false;
        }
        return matchesDateRange(order.createdAt, dateFrom, dateTo);
      })
    : allRows;

  function resetPaging(): void {
    setCursorStack([]);
  }

  // Report mode has no server-side pagination — a filter matching more than
  // `REPORT_LIMIT` rows is silently cut off rather than merely slow, so this
  // names the cap rather than letting the count look final.
  const possiblyTruncated = isReportMode && allRows.length === REPORT_LIMIT;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={<span>Admin / Arbetsordrar</span>}
        title="Arbetsordrar"
        description="Arbetsordrar som matchar det valda filtret."
        actions={
          <div className="flex items-center gap-2">
            {bookingId === undefined ? null : (
              <Badge tone="neutral" asChild>
                <button
                  type="button"
                  onClick={() => {
                    setBookingId(undefined);
                  }}
                >
                  Kopplad till en bokning · visa alla
                </button>
              </Badge>
            )}
            <CreateWorkOrderDialog mode={{ kind: 'free' }} />
          </div>
        }
      />

      <ListPage
        filters={
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Status
              </span>
              <Select
                value={statusFilter}
                onValueChange={(next: string) => {
                  const option = STATUS_FILTER_OPTIONS.find(
                    (candidate) => candidate.value === next,
                  );
                  if (option !== undefined) {
                    setStatusFilter(option.value);
                    resetPaging();
                  }
                }}
              >
                <SelectTrigger className="w-44" aria-label="Filtrera på status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Mekaniker
              </span>
              <Select
                value={assignedUserId}
                onValueChange={(next: string) => {
                  setAssignedUserId(next);
                  resetPaging();
                }}
              >
                <SelectTrigger
                  className="w-44"
                  aria-label="Filtrera på mekaniker"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_MECHANICS}>Alla mekaniker</SelectItem>
                  {rosterQuery.data?.data.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="wo-date-from"
                className="text-xs font-medium text-muted-foreground"
              >
                Från datum
              </label>
              <DatePicker
                id="wo-date-from"
                value={dateFrom === '' ? null : dateFrom}
                onChange={(value) => {
                  setDateFrom(value ?? '');
                  resetPaging();
                }}
                optional
                className="w-48"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="wo-date-to"
                className="text-xs font-medium text-muted-foreground"
              >
                Till datum
              </label>
              <DatePicker
                id="wo-date-to"
                value={dateTo === '' ? null : dateTo}
                onChange={(value) => {
                  setDateTo(value ?? '');
                  resetPaging();
                }}
                optional
                className="w-48"
              />
            </div>
          </div>
        }
        table={
          possiblyTruncated ? (
            <p className="mb-3 text-xs text-muted-foreground">
              Visar de {REPORT_LIMIT} senaste arbetsordrarna som matchar
              filtret. Fler kan finnas — begränsa filtret för att se dem.
            </p>
          ) : null
        }
      />
      <ListPage
        filters={null}
        table={
          error !== null ? (
            <ErrorState
              message={error.message}
              onRetry={() => {
                void query.refetch();
              }}
              {...(error.requestId === undefined
                ? {}
                : { requestId: error.requestId })}
            />
          ) : query.isPending ? (
            <TableSkeleton columns={columns.length} />
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(order: WorkOrderListItem) => order.id}
              caption="Arbetsordrar"
              onRowActivate={(order: WorkOrderListItem) => {
                router.push(`/admin/arbetsordrar/${order.id}`);
              }}
              empty={
                <EmptyState
                  icon={ClipboardListIcon}
                  message="Inga arbetsordrar matchar filtret."
                />
              }
              {...(isReportMode
                ? {}
                : {
                    pagination: {
                      nextCursor: query.data?.nextCursor ?? null,
                      canGoBack: cursorStack.length > 0,
                      isLoading: query.isFetching,
                      onNext: () => {
                        const next = query.data?.nextCursor;
                        if (next !== null && next !== undefined) {
                          setCursorStack((stack) => [...stack, next]);
                        }
                      },
                      onPrevious: () => {
                        setCursorStack((stack) => stack.slice(0, -1));
                      },
                    },
                  })}
            />
          )
        }
      />
    </div>
  );
}
