'use client';

import { useEffect, useRef, useState } from 'react';
import type { WorkOrderDetail } from 'shared';
import { isConflictError } from '@/components/admin/conflict';
import {
  notifyError,
  notifySuccess,
  notifyWarning,
} from '@/components/admin/notify';
import type { WorkOrderConflictChange } from '@/components/admin/work-order-conflict-dialog';
import { OdometerInput } from '@/components/form/odometer-input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { useChangeWorkOrderStatus } from '@/lib/api/work-orders';
import { formatQuantity } from '@/lib/format/quantity';

/**
 * F9.5 — completion.
 *
 * Explains what happens (which articles are about to leave stock, §6.4),
 * refuses to submit without both an out-odometer reading and at least one
 * line (F9.5.2), and holds one `Idempotency-Key` for the whole lifetime of a
 * single completion *attempt* — a lost response and a retried click replay
 * the same key (F9.5.3, F9.5.5); a fresh open, or a version conflict that
 * forces a reload, starts a new attempt with a new key.
 */
export function CompleteWorkOrderDialog({
  workOrder,
  open,
  onOpenChange,
  onVersionConflict,
}: {
  readonly workOrder: WorkOrderDetail;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onVersionConflict: (change: WorkOrderConflictChange) => void;
}) {
  const [odometerKmOut, setOdometerKmOut] = useState<number | null>(
    workOrder.odometerKmOut,
  );
  // Tracked so the odometer field can be reseeded exactly on the closed→open
  // transition — adjusted during render (React's documented way to react to
  // a prop/state change) rather than in an effect, which would render the
  // stale value first and only then correct it.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setOdometerKmOut(workOrder.odometerKmOut);
    }
  }

  const idempotencyKeyRef = useRef<string | null>(null);
  const changeStatus = useChangeWorkOrderStatus(workOrder.id);

  // Ref bookkeeping only (no `setState`), so this stays in an effect: one
  // key is minted for the whole time the dialog is open and cleared once it
  // closes, ready for a fresh attempt next time.
  useEffect(() => {
    if (open) {
      idempotencyKeyRef.current ??= crypto.randomUUID();
    } else {
      idempotencyKeyRef.current = null;
    }
  }, [open]);

  const deductions = workOrder.lines.filter(
    (line) =>
      line.type === 'PART' && line.articleId !== null && !line.stockDeducted,
  );
  const hasNoLines = workOrder.lines.length === 0;
  const missingOdometer = odometerKmOut === null;
  const blocked = hasNoLines || missingOdometer;

  async function handleComplete(): Promise<void> {
    if (blocked || odometerKmOut === null) {
      return;
    }
    const key = idempotencyKeyRef.current ?? crypto.randomUUID();
    idempotencyKeyRef.current = key;

    try {
      const response = await changeStatus.mutateAsync({
        input: {
          status: 'COMPLETED',
          version: workOrder.version,
          odometerKmOut,
        },
        idempotencyKey: key,
      });
      notifySuccess('Arbetsordern är slutförd.');
      for (const warning of response.warnings) {
        notifyWarning(warning);
      }
      idempotencyKeyRef.current = null;
      onOpenChange(false);
    } catch (error) {
      if (isConflictError(error)) {
        idempotencyKeyRef.current = null;
        onOpenChange(false);
        onVersionConflict({ label: 'Status', value: 'Slutförd' });
        return;
      }
      // The key is kept: a retry of this exact attempt must replay rather
      // than mint a second completion (F9.5.5).
      notifyError(error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Slutför arbetsorder</DialogTitle>
          <DialogDescription>
            Arbetsordern markeras som slutförd och kan inte längre redigeras på
            samma sätt. Detta går att ångra genom att sätta tillbaka statusen
            till Pågår.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">
              {deductions.length === 0
                ? 'Inga artiklar dras från lagret.'
                : 'Följande artiklar dras från lagret:'}
            </p>
            {deductions.length === 0 ? null : (
              <ul className="flex flex-col gap-1 rounded-sharp border border-border p-3 text-sm">
                {deductions.map((line) => (
                  <li key={line.id} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">{line.description}</span>
                    <span className="shrink-0 tabular-nums">
                      {formatQuantity(line.quantity, line.unit)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Field>
            <FieldLabel htmlFor="complete-odometer-out">
              Mätarställning ut
              <span aria-hidden="true" className="text-destructive">
                *
              </span>
              <span className="sr-only">(obligatoriskt)</span>
            </FieldLabel>
            <OdometerInput
              id="complete-odometer-out"
              value={odometerKmOut}
              onChange={setOdometerKmOut}
              aria-required="true"
            />
          </Field>

          {hasNoLines ? (
            <p role="alert" className="text-sm text-destructive">
              Arbetsordern har inga rader. Lägg till minst en rad innan den kan
              slutföras.
            </p>
          ) : null}
          {missingOdometer ? (
            <p role="alert" className="text-sm text-destructive">
              Ange mätarställningen ut innan arbetsordern slutförs.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            disabled={changeStatus.isPending}
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Avbryt
          </Button>
          <Button
            type="button"
            disabled={blocked}
            isPending={changeStatus.isPending}
            onClick={() => {
              void handleComplete();
            }}
          >
            Slutför arbetsorder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
