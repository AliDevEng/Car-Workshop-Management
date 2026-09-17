'use client';

import { ClipboardCheckIcon, PlusIcon } from 'lucide-react';
import Link from 'next/link';
import { type ServiceProtocolListItem, type WorkOrderDetail } from 'shared';
import { serviceProtocolStatus } from '@/components/admin/status';
import { StatusBadge } from '@/components/admin/status-badge';
import {
  EmptyState,
  ErrorState,
  TableSkeleton,
} from '@/components/admin/states';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ApiError } from '@/lib/api';
import { useWorkOrderServiceProtocols } from '@/lib/api/service-protocols';
import { formatDate } from '@/lib/format/date';

/**
 * F10.3/F10.4 — the work order's service protocols, newest version first.
 * Creation is only offered on a `COMPLETED` order (B8.2.2's own rule,
 * restated here rather than only left to the 409 it would otherwise answer
 * with).
 */
export function ServiceProtocolListCard({
  workOrder,
}: {
  readonly workOrder: WorkOrderDetail;
}) {
  const protocolsQuery = useWorkOrderServiceProtocols(workOrder.id, {
    limit: 20,
  });

  const error =
    protocolsQuery.error === null
      ? null
      : protocolsQuery.error instanceof ApiError
        ? protocolsQuery.error
        : ApiError.invalidResponse('Serviceprotokollen kunde inte visas.');

  const canCreate = workOrder.status === 'COMPLETED';

  return (
    <Card className="rounded-soft">
      <CardHeader>
        <CardTitle>Serviceprotokoll</CardTitle>
        <CardAction>
          {canCreate ? (
            <Button type="button" variant="secondary" size="sm" asChild>
              <Link href={`/admin/arbetsordrar/${workOrder.id}/protokoll/ny`}>
                <PlusIcon aria-hidden="true" />
                Skapa serviceprotokoll
              </Link>
            </Button>
          ) : (
            <Button type="button" variant="secondary" size="sm" disabled>
              <PlusIcon aria-hidden="true" />
              Skapa serviceprotokoll
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {canCreate ? null : (
          <p className="text-xs text-muted-foreground">
            Ett serviceprotokoll kan bara skapas för en avslutad arbetsorder.
          </p>
        )}

        {error !== null ? (
          <ErrorState
            message={error.message}
            onRetry={() => {
              void protocolsQuery.refetch();
            }}
            {...(error.requestId === undefined
              ? {}
              : { requestId: error.requestId })}
          />
        ) : protocolsQuery.isPending ? (
          <TableSkeleton rows={2} columns={3} />
        ) : (protocolsQuery.data?.data.length ?? 0) === 0 ? (
          <EmptyState
            icon={ClipboardCheckIcon}
            message="Inga serviceprotokoll skapade än."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {protocolsQuery.data?.data.map((protocol: ServiceProtocolListItem) => (
              <li key={protocol.id}>
                <Link
                  href={`/admin/arbetsordrar/${workOrder.id}/protokoll/${protocol.id}`}
                  className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-sharp border border-border px-3 py-2 hover:bg-accent focus-visible:bg-accent"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {protocol.number ?? `Utkast v${String(protocol.revision)}`}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {protocol.performedBy.name} ·{' '}
                      {formatDate(protocol.performedAt)}
                    </span>
                  </span>
                  <StatusBadge status={serviceProtocolStatus(protocol.finalisedAt)} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
