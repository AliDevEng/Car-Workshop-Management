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
  IN_PROGRESS: 'Sätt som pågår',
  AWAITING_PARTS: 'Vänta på delar',
  READY_FOR_PICKUP: 'Klarmarkera för upphämtning',
  COMPLETED: 'Slutför arbetsorder',
  CANCELLED: 'Avbryt arbetsorder',
};

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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Status</span>
        <StatusBadge status={workOrderStatus(workOrder.status)} />
      </div>

      {transitions.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Arbetsordern är avbruten. Inga fler ändringar kan göras.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {transitions.map((status) => (
            <Button
              key={status}
              type="button"
              variant={status === 'CANCELLED' ? 'destructive' : 'secondary'}
              size="sm"
              isPending={changeStatus.isPending}
              onClick={() => {
                handleTransitionClick(status);
              }}
            >
              {STATUS_ACTION_LABELS[status]}
            </Button>
          ))}
        </div>
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
