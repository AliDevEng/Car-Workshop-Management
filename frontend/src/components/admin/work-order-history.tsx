'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import { ClipboardListIcon } from 'lucide-react';
import Link from 'next/link';
import {
  ore,
  type WorkOrderHistoryEntry,
  type WorkOrderHistoryResponse,
} from 'shared';
import { workOrderStatus } from '@/components/admin/status';
import { StatusBadge } from '@/components/admin/status-badge';
import {
  EmptyState,
  ErrorState,
  TableSkeleton,
} from '@/components/admin/states';
import {
  useCustomerWorkOrderHistory,
  useVehicleWorkOrderHistory,
} from '@/lib/api/work-orders';
import { ApiError } from '@/lib/api';
import { formatCurrency } from '@/lib/format/currency';
import { formatDate } from '@/lib/format/date';

const HISTORY_PAGE_SIZE = 10;

function HistoryRow({ entry }: { readonly entry: WorkOrderHistoryEntry }) {
  return (
    <li>
      <Link
        href={`/admin/arbetsordrar/${entry.id}`}
        className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-sharp border border-border px-3 py-2 hover:bg-accent focus-visible:bg-accent"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">
            {entry.number ?? 'Utkast'}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {entry.description}
            {entry.completedAt === null
              ? ''
              : ` · Slutförd ${formatDate(entry.completedAt)}`}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <StatusBadge status={workOrderStatus(entry.status)} />
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatCurrency(ore(entry.totals.roundedGrossOre))}
          </span>
        </span>
      </Link>
    </li>
  );
}

function HistoryList({
  query,
  emptyMessage,
}: {
  readonly query: UseQueryResult<WorkOrderHistoryResponse, Error>;
  readonly emptyMessage: string;
}) {
  const error =
    query.error === null
      ? null
      : query.error instanceof ApiError
        ? query.error
        : ApiError.invalidResponse('Arbetsorderhistoriken kunde inte visas.');

  if (error !== null) {
    return (
      <ErrorState
        message={error.message}
        onRetry={() => {
          void query.refetch();
        }}
        {...(error.requestId === undefined
          ? {}
          : { requestId: error.requestId })}
      />
    );
  }

  if (query.isPending) {
    return <TableSkeleton rows={3} columns={2} />;
  }

  const entries = query.data?.data ?? [];

  if (entries.length === 0) {
    return <EmptyState inline icon={ClipboardListIcon} message={emptyMessage} />;
  }

  return (
    <ul className="flex flex-col gap-2">
      {entries.map((entry: WorkOrderHistoryEntry) => (
        <HistoryRow key={entry.id} entry={entry} />
      ))}
    </ul>
  );
}

/** F9.7.1 — the vehicle's newest-first service history (§6.3, B6.8). */
export function VehicleWorkOrderHistory({
  vehicleId,
}: {
  readonly vehicleId: string;
}) {
  const query = useVehicleWorkOrderHistory(vehicleId, {
    limit: HISTORY_PAGE_SIZE,
  });
  return (
    <HistoryList
      query={query}
      emptyMessage="Inga arbetsordrar registrerade för fordonet än."
    />
  );
}

/** F9.7.1 — the jobs billed to this customer. */
export function CustomerWorkOrderHistory({
  customerId,
}: {
  readonly customerId: string;
}) {
  const query = useCustomerWorkOrderHistory(customerId, {
    limit: HISTORY_PAGE_SIZE,
  });
  return (
    <HistoryList
      query={query}
      emptyMessage="Inga arbetsordrar registrerade för kunden än."
    />
  );
}
