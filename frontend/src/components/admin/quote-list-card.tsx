'use client';

import { FileTextIcon } from 'lucide-react';
import Link from 'next/link';
import { ore, type QuoteListItem, type WorkOrderDetail } from 'shared';
import { CreateQuoteDialog } from '@/components/admin/create-quote-dialog';
import { quoteStatus } from '@/components/admin/status';
import { StatusBadge } from '@/components/admin/status-badge';
import {
  EmptyState,
  ErrorState,
  TableSkeleton,
} from '@/components/admin/states';
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ApiError } from '@/lib/api';
import { useWorkOrderQuotes } from '@/lib/api/quotes';
import { formatCurrency } from '@/lib/format/currency';
import { formatDate } from '@/lib/format/date';

/**
 * F10.1/F10.2 — the work order's quotes, newest version first, embedded on
 * its detail page (§6.6: "Quotes listed on the work order").
 */
export function QuoteListCard({
  workOrder,
}: {
  readonly workOrder: WorkOrderDetail;
}) {
  const quotesQuery = useWorkOrderQuotes(workOrder.id, { limit: 20 });

  const error =
    quotesQuery.error === null
      ? null
      : quotesQuery.error instanceof ApiError
        ? quotesQuery.error
        : ApiError.invalidResponse('Offerterna kunde inte visas.');

  const canCreate = workOrder.status !== 'CANCELLED' && workOrder.lines.length > 0;
  const blockedReason =
    workOrder.status === 'CANCELLED'
      ? 'Arbetsordern är avbruten.'
      : workOrder.lines.length === 0
        ? 'Lägg till minst en rad innan en offert kan skapas.'
        : null;

  return (
    <Card className="rounded-soft">
      <CardHeader>
        <CardTitle>Offerter</CardTitle>
        <CardAction>
          <CreateQuoteDialog workOrderId={workOrder.id} disabled={!canCreate} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {blockedReason === null ? null : (
          <p className="text-xs text-muted-foreground">{blockedReason}</p>
        )}

        {error !== null ? (
          <ErrorState
            message={error.message}
            onRetry={() => {
              void quotesQuery.refetch();
            }}
            {...(error.requestId === undefined
              ? {}
              : { requestId: error.requestId })}
          />
        ) : quotesQuery.isPending ? (
          <TableSkeleton rows={2} columns={3} />
        ) : (quotesQuery.data?.data.length ?? 0) === 0 ? (
          <EmptyState inline icon={FileTextIcon} message="Inga offerter skapade än." />
        ) : (
          <ul className="flex flex-col gap-2">
            {quotesQuery.data?.data.map((quote: QuoteListItem) => (
              <li key={quote.id}>
                <Link
                  href={`/admin/arbetsordrar/${workOrder.id}/offerter/${quote.id}`}
                  className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-sharp border border-border px-3 py-2 hover:bg-accent focus-visible:bg-accent"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {quote.number ?? `Utkast v${String(quote.revision)}`}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {quote.sentAt === null
                        ? 'Ej skickad'
                        : `Skickad ${formatDate(quote.sentAt)}`}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <StatusBadge status={quoteStatus(quote.status)} />
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {formatCurrency(ore(quote.totals.roundedGrossOre))}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
