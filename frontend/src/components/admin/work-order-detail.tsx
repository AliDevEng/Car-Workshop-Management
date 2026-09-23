'use client';

import { ChevronRightIcon, LockIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { isWorkOrderLocked, type UpdateWorkOrderInput } from 'shared';
import { isConflictError } from '@/components/admin/conflict';
import { DetailLayout } from '@/components/admin/detail-layout';
import { InlineField } from '@/components/admin/inline-field';
import { notifyError, notifyWarning } from '@/components/admin/notify';
import { PageHeader } from '@/components/admin/page-header';
import { QuoteListCard } from '@/components/admin/quote-list-card';
import { ServiceProtocolListCard } from '@/components/admin/service-protocol-list-card';
import { DetailSkeleton, ErrorState } from '@/components/admin/states';
import {
  WorkOrderConflictDialog,
  type WorkOrderConflictChange,
} from '@/components/admin/work-order-conflict-dialog';
import { WorkOrderLines } from '@/components/admin/work-order-lines';
import { WorkOrderStatusControl } from '@/components/admin/work-order-status-control';
import { WorkOrderTotalsPanel } from '@/components/admin/work-order-totals-panel';
import { OdometerInput } from '@/components/form/odometer-input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDraftField } from '@/lib/admin/use-draft-field';
import { ApiError } from '@/lib/api';
import { useUserRoster } from '@/lib/api/users';
import { useUpdateWorkOrder, useWorkOrder } from '@/lib/api/work-orders';
import { formatDate } from '@/lib/format/date';
import { formatOdometer } from '@/lib/format/odometer';

const UNASSIGNED = 'UNASSIGNED' as const;

/**
 * F9.2 — the mechanic's screen. Header fields save one at a time, each
 * carrying the `version` it last read (F9.6.1); a `409` opens
 * {@link WorkOrderConflictDialog} rather than silently discarding the edit.
 * Lines are a separate, non-version-checked concern (F9.3) rendered below,
 * and the totals panel (F9.4) only ever displays `workOrder.totals` as read
 * from the server.
 */
export function WorkOrderDetailPage({
  workOrderId,
}: {
  readonly workOrderId: string;
}) {
  const workOrderQuery = useWorkOrder(workOrderId);
  const updateWorkOrder = useUpdateWorkOrder(workOrderId);
  const rosterQuery = useUserRoster();
  const [conflict, setConflict] = useState<WorkOrderConflictChange | null>(
    null,
  );
  // Called unconditionally, ahead of the loading/error returns below, with a
  // `null` fallback until the order has loaded — `useDraftField`'s own
  // effect adopts the real value the moment it arrives.
  const odometerInField = useDraftField<number | null>(
    workOrderQuery.data?.odometerKmIn ?? null,
  );
  const odometerOutField = useDraftField<number | null>(
    workOrderQuery.data?.odometerKmOut ?? null,
  );

  const error =
    workOrderQuery.error === null
      ? null
      : workOrderQuery.error instanceof ApiError
        ? workOrderQuery.error
        : ApiError.invalidResponse('Arbetsordern kunde inte visas.');

  if (error !== null) {
    return (
      <ErrorState
        message={error.message}
        onRetry={() => {
          void workOrderQuery.refetch();
        }}
        {...(error.requestId === undefined
          ? {}
          : { requestId: error.requestId })}
      />
    );
  }

  if (workOrderQuery.isPending || workOrderQuery.data === undefined) {
    return <DetailSkeleton />;
  }

  const workOrder = workOrderQuery.data;
  const locked = isWorkOrderLocked(workOrder.status);

  /**
   * Every header write in one place: carries the `version` this render read,
   * surfaces any warning the backend returned (§6.4/§3.5's low-odometer and
   * negative-stock warnings), and opens the conflict dialog on a `409`
   * rather than letting the write vanish silently.
   */
  async function saveHeaderField(
    patch: Omit<UpdateWorkOrderInput, 'version'>,
  ): Promise<{ readonly ok: boolean; readonly error?: unknown }> {
    try {
      const response = await updateWorkOrder.mutateAsync({
        ...patch,
        version: workOrder.version,
      });
      for (const warning of response.warnings) {
        notifyWarning(warning);
      }
      return { ok: true };
    } catch (caught) {
      return { ok: false, error: caught };
    }
  }

  async function saveDescription(value: string): Promise<void> {
    const result = await saveHeaderField({ description: value });
    if (!result.ok) {
      if (isConflictError(result.error)) {
        setConflict({ label: 'Beskrivning', value });
      }
      throw result.error instanceof Error
        ? result.error
        : new Error('Kunde inte sparas.');
    }
  }

  async function saveInternalNote(value: string): Promise<void> {
    const result = await saveHeaderField({
      internalNote: value === '' ? null : value,
    });
    if (!result.ok) {
      if (isConflictError(result.error)) {
        setConflict({ label: 'Intern anteckning', value });
      }
      throw result.error instanceof Error
        ? result.error
        : new Error('Kunde inte sparas.');
    }
  }

  async function handleAssignedUserChange(next: string): Promise<void> {
    const value = next === UNASSIGNED ? null : next;
    const label =
      next === UNASSIGNED
        ? 'Ej tilldelad'
        : (rosterQuery.data?.data.find((user) => user.id === next)?.name ??
          next);
    const result = await saveHeaderField({ assignedUserId: value });
    if (!result.ok) {
      if (isConflictError(result.error)) {
        setConflict({ label: 'Mekaniker', value: label });
      } else {
        notifyError(result.error);
      }
    }
  }

  async function commitOdometerIn(): Promise<void> {
    const value = odometerInField.draft;
    if (value === workOrder.odometerKmIn) {
      odometerInField.clearDirty();
      return;
    }
    const result = await saveHeaderField({ odometerKmIn: value });
    if (result.ok) {
      odometerInField.clearDirty();
      return;
    }
    if (isConflictError(result.error)) {
      // A conflict dialog offer to reload is the only thing that should
      // adopt a different value, so clearing here is safe; a plain retry
      // (below) must not have its draft clobbered by an unrelated refetch,
      // so dirty stays set in that branch.
      odometerInField.clearDirty();
      setConflict({
        label: 'Mätarställning in',
        value: value === null ? 'Tom' : formatOdometer(value),
      });
    } else {
      notifyError(result.error);
    }
  }

  async function commitOdometerOut(): Promise<void> {
    const value = odometerOutField.draft;
    if (value === workOrder.odometerKmOut) {
      odometerOutField.clearDirty();
      return;
    }
    const result = await saveHeaderField({ odometerKmOut: value });
    if (result.ok) {
      odometerOutField.clearDirty();
      return;
    }
    if (isConflictError(result.error)) {
      odometerOutField.clearDirty();
      setConflict({
        label: 'Mätarställning ut',
        value: value === null ? 'Tom' : formatOdometer(value),
      });
    } else {
      notifyError(result.error);
    }
  }

  function handleReload(): void {
    setConflict(null);
    void workOrderQuery.refetch();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'Arbetsordrar', href: '/admin/arbetsordrar' },
          { label: workOrder.number ?? 'Utkast' },
        ]}
        title={workOrder.number ?? 'Arbetsorder (utkast)'}
        description={`${workOrder.vehicle.registrationNumberDisplay} · ${workOrder.vehicle.make} ${workOrder.vehicle.model}`}
        /*
         * The status badge and its transitions live in the page header,
         * where the primary action for a page is looked for — not in a card
         * of their own headed "Status" above a label also reading "Status"
         * (UI_UX_AUDIT W3, W7).
         */
        actions={
          <WorkOrderStatusControl
            workOrder={workOrder}
            onVersionConflict={setConflict}
          />
        }
      />

      {/*
       * Two labelled chips rather than a name with "Visa fordon" beneath it,
       * which read as one control pointing at the wrong thing (W6).
       */}
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/admin/kunder/${workOrder.customer.id}`}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-sharp border border-border px-3 text-sm hover:bg-accent"
        >
          <span className="text-muted-foreground">Kund:</span>
          <span className="font-medium">{workOrder.customer.name}</span>
          <ChevronRightIcon aria-hidden="true" className="size-3.5" />
        </Link>
        <Link
          href={`/admin/fordon/${workOrder.vehicle.id}`}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-sharp border border-border px-3 text-sm hover:bg-accent"
        >
          <span className="text-muted-foreground">Fordon:</span>
          <span className="font-medium tabular-nums">
            {workOrder.vehicle.registrationNumberDisplay}
          </span>
          <ChevronRightIcon aria-hidden="true" className="size-3.5" />
        </Link>
      </div>

      {/*
       * One lock banner at the top of the page. It used to be a sentence
       * inside the lines card, while the description and both odometer
       * fields above it stayed editable and went on auto-saving (W4).
       */}
      {locked ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-sharp border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
        >
          <LockIcon aria-hidden="true" className="size-4 shrink-0" />
          {/*
           * States the lock rather than the status — the badge in the header
           * already says "Slutförd" or "Avbruten", and repeating it here
           * would also collide with the success toast the transition raises.
           */}
          {workOrder.status === 'CANCELLED'
            ? 'Arbetsordern är låst. Rader, beskrivning och mätarställning kan inte längre ändras, och en avbruten order kan inte återöppnas.'
            : 'Arbetsordern är låst. Rader, beskrivning och mätarställning kan inte längre ändras — återöppna den först om något behöver rättas.'}
        </p>
      ) : null}

      <DetailLayout
        main={
          <div className="flex flex-col gap-4">
            <Card className="rounded-soft">
              <CardHeader>
                <CardTitle>Uppdraget</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <InlineField
                  label="Beskrivning"
                  required
                  undoable
                  disabled={locked}
                  value={workOrder.description}
                  onSave={saveDescription}
                />
                {/*
                 * Deliberately still editable on a locked order: an internal
                 * note is the workshop's own record of a finished job, and
                 * the backend does not lock it either.
                 */}
                <InlineField
                  label="Intern anteckning"
                  multiline
                  undoable
                  value={workOrder.internalNote ?? ''}
                  onSave={saveInternalNote}
                />
              </CardContent>
            </Card>

            {/*
             * The lines come before everything secondary. They are what a
             * mechanic works in all day, and on a draft they used to start
             * some 1 400 px down the page (W1).
             */}
            <Card className="rounded-soft">
              <CardContent className="pt-6">
                <WorkOrderLines workOrder={workOrder} />
              </CardContent>
            </Card>

            <Card className="rounded-soft">
              <CardHeader>
                <CardTitle>Mätarställning</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">In</span>
                  <OdometerInput
                    aria-label="Mätarställning in"
                    value={odometerInField.draft}
                    disabled={locked}
                    onChange={(km) => {
                      odometerInField.onChange(km);
                    }}
                    onBlur={() => {
                      void commitOdometerIn();
                    }}
                    optional
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Ut</span>
                  <OdometerInput
                    aria-label="Mätarställning ut"
                    value={odometerOutField.draft}
                    disabled={locked}
                    onChange={(km) => {
                      odometerOutField.onChange(km);
                    }}
                    onBlur={() => {
                      void commitOdometerOut();
                    }}
                    optional
                  />
                </div>
              </CardContent>
            </Card>

            <QuoteListCard workOrder={workOrder} />
            <ServiceProtocolListCard workOrder={workOrder} />
          </div>
        }
        aside={
          <div className="flex flex-col gap-4">
            <WorkOrderTotalsPanel totals={workOrder.totals} />

            <Card className="rounded-soft">
              <CardHeader>
                <CardTitle>Mekaniker</CardTitle>
              </CardHeader>
              <CardContent>
                <Select
                  value={workOrder.assignedUserId ?? UNASSIGNED}
                  disabled={locked}
                  onValueChange={(next: string) => {
                    void handleAssignedUserChange(next);
                  }}
                >
                  <SelectTrigger className="w-full" aria-label="Mekaniker">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>Ej tilldelad</SelectItem>
                    {rosterQuery.data?.data.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card className="rounded-soft" size="sm">
              <CardHeader>
                <CardTitle className="text-xs text-muted-foreground">
                  Skapad i systemet
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {formatDate(workOrder.createdAt)}
              </CardContent>
            </Card>
          </div>
        }
      />

      {conflict === null ? null : (
        <WorkOrderConflictDialog
          open={conflict !== null}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setConflict(null);
            }
          }}
          change={conflict}
          isReloading={workOrderQuery.isFetching}
          onReload={handleReload}
        />
      )}
    </div>
  );
}
