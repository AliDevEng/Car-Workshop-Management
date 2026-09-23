'use client';

import { useRef, useState } from 'react';
import {
  allowedTransitions,
  type WorkOrderDetail,
  type WorkOrderStatus,
} from 'shared';
import { CompleteWorkOrderDialog } from '@/components/admin/complete-work-order-dialog';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { isConflictError } from '@/components/admin/conflict';
import {
  notifyError,
  notifySuccess,
  notifyWarning,
} from '@/components/admin/notify';
import { workOrderStatus } from '@/components/admin/status';
import { StatusBadge } from '@/components/admin/status-badge';
import type { WorkOrderConflictChange } from '@/components/admin/work-order-conflict-dialog';
import { Button } from '@/components/ui/button';
import { useChangeWorkOrderStatus } from '@/lib/api/work-orders';

const STATUS_ACTION_LABELS: Readonly<Record<WorkOrderStatus, string>> = {
  DRAFT: 'Sätt som utkast',
  IN_PROGRESS: 'Påbörja arbetet',
  AWAITING_PARTS: 'Vänta på delar',
  READY_FOR_PICKUP: 'Klar för upphämtning',
  COMPLETED: 'Slutför arbetsorder',
  CANCELLED: 'Avbryt arbetsorder',
};

/**
 * The same move means different things depending on where the order is.
 * `IN_PROGRESS` from a draft is the normal next step; `IN_PROGRESS` from
 * `COMPLETED` is reopening a finished job, and labelling that "Påbörja
 * arbetet" invites it (UI_UX_AUDIT W3).
 */
function actionLabel(from: WorkOrderStatus, to: WorkOrderStatus): string {
  if (to === 'IN_PROGRESS' && from === 'COMPLETED') {
    return 'Återöppna arbetsorder';
  }
  return STATUS_ACTION_LABELS[to];
}

/**
 * Which transition is *the* next step, and therefore the one primary button
 * on the screen. Anything else is secondary; cancelling is separated out
 * entirely below. Returning `undefined` (from `COMPLETED`, where every move
 * is a correction rather than progress) leaves the screen with no primary
 * action, which is the honest answer.
 */
function forwardTransition(
  from: WorkOrderStatus,
  transitions: readonly WorkOrderStatus[],
): WorkOrderStatus | undefined {
  if (from === 'COMPLETED') {
    return undefined;
  }
  const preference: readonly WorkOrderStatus[] =
    from === 'IN_PROGRESS'
      ? ['READY_FOR_PICKUP', 'COMPLETED', 'AWAITING_PARTS']
      : ['IN_PROGRESS', 'READY_FOR_PICKUP', 'COMPLETED'];
  return preference.find((status) => transitions.includes(status));
}

/**
 * F9.2.2 — offers only the transitions `shared`'s state machine allows from
 * the order's current status, so the UI cannot offer a move the API would
 * refuse. `COMPLETED` and `CANCELLED` open their own dialogs rather than
 * applying directly (F9.5.1 and, by the same "explain what happens before a
 * terminal move" reasoning, cancellation).
 */
export function WorkOrderStatusControl({
  workOrder,
  onVersionConflict,
}: {
  readonly workOrder: WorkOrderDetail;
  readonly onVersionConflict: (change: WorkOrderConflictChange) => void;
}) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [completing, setCompleting] = useState(false);
  // Which transition is in flight, so only its own button spins. The
  // mutation's `isPending` is shared by every button that uses it.
  const [pendingStatus, setPendingStatus] = useState<WorkOrderStatus | null>(
    null,
  );
  const changeStatus = useChangeWorkOrderStatus(workOrder.id);
  // One key per target status, held across a failed retry — a revert from
  // `COMPLETED` writes compensating `RETURN` stock movements (§6.4), so a
  // retried click after a lost response must replay rather than mint a
  // second one. Cleared on success (the attempt is over) and on a version
  // conflict (the next attempt reads fresh data, so it is a new attempt).
  const pendingKeysRef = useRef<Partial<Record<WorkOrderStatus, string>>>({});

  async function applyTransition(status: WorkOrderStatus): Promise<void> {
    const key = pendingKeysRef.current[status] ?? crypto.randomUUID();
    pendingKeysRef.current[status] = key;
    setPendingStatus(status);
    try {
      const response = await changeStatus.mutateAsync({
        input: { status, version: workOrder.version },
        idempotencyKey: key,
      });
      delete pendingKeysRef.current[status];
      notifySuccess(`Status ändrad till ${workOrderStatus(status).label}.`);
      for (const warning of response.warnings) {
        notifyWarning(warning);
      }
      setConfirmingCancel(false);
    } catch (error) {
      if (isConflictError(error)) {
        delete pendingKeysRef.current[status];
        setConfirmingCancel(false);
        onVersionConflict({
          label: 'Status',
          value: workOrderStatus(status).label,
        });
        return;
      }
      // The key is kept: a retry of this exact attempt must replay.
      notifyError(error);
    } finally {
      setPendingStatus(null);
    }
  }

  function handleTransitionClick(status: WorkOrderStatus): void {
    if (status === 'COMPLETED') {
      setCompleting(true);
      return;
    }
    if (status === 'CANCELLED') {
      setConfirmingCancel(true);
      return;
    }
    void applyTransition(status);
  }

  const transitions = allowedTransitions(workOrder.status);
  const forward = forwardTransition(workOrder.status, transitions);
  const canCancel = transitions.includes('CANCELLED');
  const others = transitions.filter(
    (status) => status !== forward && status !== 'CANCELLED',
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusBadge status={workOrderStatus(workOrder.status)} />

      {transitions.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Arbetsordern är avbruten. Inga fler ändringar kan göras.
        </p>
      ) : (
        <>
          {/*
           * One primary action, the forward one. Cancellation is pushed to
           * the far right as an outline button: filled red next to a small
           * secondary "next step" made the destructive move the heaviest
           * thing on the page, 8 px from the button a mechanic actually
           * wants (UI_UX_AUDIT W3).
           */}
          {forward === undefined ? null : (
            <Button
              type="button"
              size="sm"
              isPending={pendingStatus === forward}
              disabled={changeStatus.isPending && pendingStatus !== forward}
              onClick={() => {
                handleTransitionClick(forward);
              }}
            >
              {actionLabel(workOrder.status, forward)}
            </Button>
          )}
          {others.map((status) => (
            <Button
              key={status}
              type="button"
              variant="secondary"
              size="sm"
              // Only the clicked button spins. `changeStatus.isPending` on
              // all of them made every transition look like it was running.
              isPending={pendingStatus === status}
              disabled={changeStatus.isPending && pendingStatus !== status}
              onClick={() => {
                handleTransitionClick(status);
              }}
            >
              {actionLabel(workOrder.status, status)}
            </Button>
          ))}
          {canCancel ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto text-destructive hover:text-destructive"
              isPending={pendingStatus === 'CANCELLED'}
              disabled={changeStatus.isPending && pendingStatus !== 'CANCELLED'}
              onClick={() => {
                handleTransitionClick('CANCELLED');
              }}
            >
              {STATUS_ACTION_LABELS.CANCELLED}
            </Button>
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={confirmingCancel}
        onOpenChange={setConfirmingCancel}
        title="Avbryt arbetsorder"
        description="Arbetsordern markeras som avbruten och kan inte skrivas till igen. Detta går inte att ångra — en ny arbetsorder kan skapas vid behov."
        confirmLabel="Avbryt arbetsorder"
        isPending={changeStatus.isPending}
        onConfirm={() => {
          void applyTransition('CANCELLED');
        }}
      />

      <CompleteWorkOrderDialog
        workOrder={workOrder}
        open={completing}
        onOpenChange={setCompleting}
        onVersionConflict={onVersionConflict}
      />
    </div>
  );
}
