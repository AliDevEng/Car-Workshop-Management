'use client';

import { InboxIcon } from 'lucide-react';
import { useState } from 'react';
import {
  BOOKING_REQUEST_STATUS_LABELS,
  BOOKING_REQUEST_STATUSES,
  REQUESTED_TIME_OF_DAY_LABELS,
  type BookingRequest,
  type BookingRequestStatus,
} from 'shared';
import { ConfirmBookingRequestDialog } from '@/components/admin/confirm-booking-request-dialog';
import { DataTable, type DataTableColumn } from '@/components/admin/data-table';
import { ListPage } from '@/components/admin/list-page';
import { RejectBookingRequestDialog } from '@/components/admin/reject-booking-request-dialog';
import { bookingRequestStatus } from '@/components/admin/status';
import { StatusBadge } from '@/components/admin/status-badge';
import {
  EmptyState,
  ErrorState,
  TableSkeleton,
} from '@/components/admin/states';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { useBookingRequests } from '@/lib/api/bookings';
import { formatDate, formatDateOnly, formatDateTime } from '@/lib/format/date';
import { getService } from '@/lib/public/services';

const PAGE_SIZE = 25;
const STATUS_FILTER_ALL = 'ALL' as const;
export type StatusFilter = BookingRequestStatus | typeof STATUS_FILTER_ALL;

const STATUS_FILTER_OPTIONS: readonly StatusFilter[] = [
  STATUS_FILTER_ALL,
  ...BOOKING_REQUEST_STATUSES,
];

function statusFilterLabel(filter: StatusFilter): string {
  return filter === STATUS_FILTER_ALL
    ? 'Alla statusar'
    : BOOKING_REQUEST_STATUS_LABELS[filter];
}

/** `serviceTypeIds` are the public site's local content slugs (F2.3.3), not
 * a database entity — the same values `lib/public/services.ts` already maps
 * to Swedish names for the marketing pages. */
function serviceLabel(id: string): string {
  return getService(id)?.name ?? id;
}

const ACTIONABLE_STATUSES: ReadonlySet<BookingRequestStatus> = new Set([
  'PENDING',
  'SPAM',
]);

function BookingRequestDetailDialog({
  request,
  onOpenChange,
  onConfirm,
  onReject,
}: {
  readonly request: BookingRequest;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void;
  readonly onReject: () => void;
}) {
  const actionable = ACTIONABLE_STATUSES.has(request.status);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{request.customerName}</DialogTitle>
          <DialogDescription>
            Inkommen {formatDateTime(request.submittedAt)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 text-sm">
          {request.status === 'SPAM' ? (
            <p className="rounded-sharp border border-dashed border-oxide/40 bg-oxide/6 px-3 py-2 text-status-oxide">
              Flaggad som möjlig skräppost av innehållsfiltret. Granska
              uppgifterna innan du bekräftar.
            </p>
          ) : null}

          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
            <span className="text-muted-foreground">Status</span>
            <StatusBadge status={bookingRequestStatus(request.status)} />

            <span className="text-muted-foreground">Telefon</span>
            <span className="tabular-nums">{request.phone}</span>

            <span className="text-muted-foreground">E-post</span>
            <span>{request.email ?? 'Ej angiven'}</span>

            <span className="text-muted-foreground">Registreringsnummer</span>
            <span className="tabular-nums">{request.regNr ?? 'Ej angivet'}</span>

            <span className="text-muted-foreground">Önskat datum</span>
            <span>
              {request.requestedDate === null
                ? 'Flexibelt'
                : formatDateOnly(request.requestedDate)}
            </span>

            <span className="text-muted-foreground">Önskad tid</span>
            <span>
              {request.requestedTimeOfDay === null
                ? 'Ingen preferens'
                : REQUESTED_TIME_OF_DAY_LABELS[request.requestedTimeOfDay]}
            </span>

            {request.serviceTypeIds.length === 0 ? null : (
              <>
                <span className="text-muted-foreground">Önskade tjänster</span>
                <span>
                  {request.serviceTypeIds.map(serviceLabel).join(', ')}
                </span>
              </>
            )}

            {request.handledAt === null ? null : (
              <>
                <span className="text-muted-foreground">Behandlad</span>
                <span>{formatDateTime(request.handledAt)}</span>
              </>
            )}

            {request.rejectionReason === null ? null : (
              <>
                <span className="text-muted-foreground">Anledning</span>
                <span>{request.rejectionReason}</span>
              </>
            )}
          </div>

          {request.message === null ? null : (
            <div className="rounded-sharp border border-border bg-muted/40 p-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Meddelande från kunden
              </p>
              <p>{request.message}</p>
            </div>
          )}
        </div>

        {actionable ? (
          <DialogFooter>
            <Button type="button" variant="destructive" onClick={onReject}>
              Avvisa
            </Button>
            <Button type="button" onClick={onConfirm}>
              Bekräfta
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** F8.1 — the staff inbox for public booking requests. */
export function BookingRequestInbox({
  initialStatus = 'PENDING',
}: {
  /** The dashboard links here with `status=PENDING` (F5); read once as the
   * starting filter rather than hard-coded, so a future link naming a
   * different status is not silently ignored. */
  readonly initialStatus?: StatusFilter;
}) {
  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  const [cursorStack, setCursorStack] = useState<readonly string[]>([]);
  const [detailRequest, setDetailRequest] = useState<BookingRequest | null>(
    null,
  );
  const [confirmRequest, setConfirmRequest] = useState<BookingRequest | null>(
    null,
  );
  const [rejectRequest, setRejectRequest] = useState<BookingRequest | null>(
    null,
  );

  const cursor = cursorStack.at(-1);
  const requestsQuery = useBookingRequests({
    ...(status === STATUS_FILTER_ALL ? {} : { status }),
    ...(cursor === undefined ? {} : { cursor }),
    limit: PAGE_SIZE,
  });

  const error =
    requestsQuery.error === null
      ? null
      : requestsQuery.error instanceof ApiError
        ? requestsQuery.error
        : ApiError.invalidResponse('Förfrågningarna kunde inte visas.');

  const columns: readonly DataTableColumn<BookingRequest>[] = [
    {
      id: 'customerName',
      header: 'Kund',
      cell: (request: BookingRequest) => (
        <span className="min-w-0">
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
      id: 'regNr',
      header: 'Regnr',
      cell: (request: BookingRequest) => (
        <span className="tabular-nums">{request.regNr ?? 'Saknas'}</span>
      ),
    },
    {
      id: 'requestedDate',
      header: 'Önskat datum',
      cell: (request: BookingRequest) =>
        request.requestedDate === null
          ? 'Flexibelt'
          : formatDateOnly(request.requestedDate),
    },
    {
      id: 'submittedAt',
      header: 'Inkommen',
      cell: (request: BookingRequest) => (
        <span className="tabular-nums">{formatDate(request.submittedAt)}</span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: (request: BookingRequest) => (
        <span className="flex items-center gap-2">
          <StatusBadge status={bookingRequestStatus(request.status)} />
          {request.status === 'SPAM' ? (
            <Badge tone="oxide">Granska</Badge>
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <>
      <ListPage
        filters={
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={status}
              onValueChange={(next: string) => {
                setStatus(next as StatusFilter);
                setCursorStack([]);
              }}
            >
              <SelectTrigger aria-label="Filtrera på status" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTER_OPTIONS.map((option: StatusFilter) => (
                  <SelectItem key={option} value={option}>
                    {statusFilterLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {requestsQuery.data === undefined ? null : (
              <Badge tone="hivis">
                {requestsQuery.data.unhandledCount} obehandlade
              </Badge>
            )}
          </div>
        }
        table={
          error !== null ? (
            <ErrorState
              message={error.message}
              onRetry={() => {
                void requestsQuery.refetch();
              }}
              {...(error.requestId === undefined
                ? {}
                : { requestId: error.requestId })}
            />
          ) : requestsQuery.isPending ? (
            <TableSkeleton columns={columns.length} />
          ) : (
            <DataTable
              columns={columns}
              rows={requestsQuery.data?.data ?? []}
              rowKey={(request: BookingRequest) => request.id}
              caption="Bokningsförfrågningar"
              onRowActivate={setDetailRequest}
              empty={
                <EmptyState
                  icon={InboxIcon}
                  message={
                    status === 'PENDING'
                      ? 'Inga obehandlade förfrågningar. Bra jobbat.'
                      : 'Inga förfrågningar matchar filtret.'
                  }
                />
              }
              pagination={{
                nextCursor: requestsQuery.data?.nextCursor ?? null,
                canGoBack: cursorStack.length > 0,
                isLoading: requestsQuery.isFetching,
                onNext: () => {
                  const next = requestsQuery.data?.nextCursor;
                  if (next !== null && next !== undefined) {
                    setCursorStack((stack) => [...stack, next]);
                  }
                },
                onPrevious: () => {
                  setCursorStack((stack) => stack.slice(0, -1));
                },
              }}
            />
          )
        }
      />

      {detailRequest === null ? null : (
        <BookingRequestDetailDialog
          request={detailRequest}
          onOpenChange={(open) => {
            if (!open) {
              setDetailRequest(null);
            }
          }}
          onConfirm={() => {
            setConfirmRequest(detailRequest);
            setDetailRequest(null);
          }}
          onReject={() => {
            setRejectRequest(detailRequest);
            setDetailRequest(null);
          }}
        />
      )}

      {confirmRequest === null ? null : (
        <ConfirmBookingRequestDialog
          key={confirmRequest.id}
          request={confirmRequest}
          open
          onOpenChange={(open: boolean) => {
            if (!open) {
              setConfirmRequest(null);
            }
          }}
        />
      )}

      {rejectRequest === null ? null : (
        <RejectBookingRequestDialog
          key={rejectRequest.id}
          request={rejectRequest}
          open
          onOpenChange={(open: boolean) => {
            if (!open) {
              setRejectRequest(null);
            }
          }}
        />
      )}
    </>
  );
}
