'use client';

import { ClipboardCheckIcon } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import { UNIT_LABELS, parseQuantity, subQuantity, type UnitValue } from 'shared';
import { QuantityInput } from '@/components/form/quantity-input';
import { notifyError, notifySuccess } from '@/components/admin/notify';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { formatQuantityForInput } from '@/lib/form/quantity-input';
import { formatSignedQuantity } from '@/lib/format/quantity';
import { useStocktake } from '@/lib/api/articles';

/**
 * F7.4 — "Inventera": takes the counted quantity and shows what will change
 * before it is sent. The server, not this dialog, writes the correcting
 * movement (`recordStocktake`) — the preview here is read-only arithmetic on
 * two values already on screen, using `shared`'s `Quantity` rather than
 * `Number(...)` for the same reason CLAUDE.md bans it for money: a stock
 * threshold a mechanic is about to act on deserves the same exactness.
 */
export function StocktakeDialog({
  articleId,
  unit,
  currentQuantity,
  disabled = false,
  disabledReason,
}: {
  readonly articleId: string;
  readonly unit: UnitValue;
  readonly currentQuantity: string;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
}) {
  const [open, setOpen] = useState(false);
  const [counted, setCounted] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const stocktake = useStocktake(articleId);
  const unitLabel = UNIT_LABELS[unit];

  function reset(): void {
    setCounted(null);
    setNote('');
  }

  const difference =
    counted === null ? null : subQuantity(parseQuantity(counted), parseQuantity(currentQuantity));

  async function submit(): Promise<void> {
    if (counted === null) {
      return;
    }
    try {
      const result = await stocktake.mutateAsync({
        countedQuantity: counted,
        ...(note.trim() === '' ? {} : { note: note.trim() }),
      });
      notifySuccess(
        `Lager inventerat: ${formatSignedQuantity(parseQuantity(result.differenceQuantity))} ${unitLabel}.`,
        `Nytt saldo: ${formatQuantityForInput(result.balanceAfter)} ${unitLabel}.`,
      );
      setOpen(false);
      reset();
    } catch (error) {
      notifyError(error);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen: boolean) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
        >
          <ClipboardCheckIcon aria-hidden="true" />
          Inventera
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Inventera artikel</DialogTitle>
          <DialogDescription>
            Ange det räknade antalet. Mellanskillnaden bokförs som en
            inventeringsjustering.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Systemets saldo:{' '}
            <span className="font-medium tabular-nums text-foreground">
              {formatQuantityForInput(currentQuantity)} {unitLabel}
            </span>
          </p>

          <Field>
            <FieldLabel htmlFor="stocktake-counted">Räknat antal</FieldLabel>
            <QuantityInput
              id="stocktake-counted"
              value={counted}
              onChange={setCounted}
              unit={unit}
              className="h-16 text-2xl font-semibold"
              aria-required
            />
          </Field>

          {difference === null ? null : (
            <p className="text-sm tabular-nums" aria-live="polite">
              Skillnad:{' '}
              <span className="font-medium">
                {formatSignedQuantity(difference)} {unitLabel}
              </span>
            </p>
          )}

          <Field>
            <FieldLabel htmlFor="stocktake-note">Anteckning (valfritt)</FieldLabel>
            <Textarea
              id="stocktake-note"
              value={note}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                setNote(event.target.value);
              }}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              // A plain button, not `DialogClose` — Escape/overlay/the ×
              // button all fire `onOpenChange` and reset there, but this one
              // does not, and would leave a half-entered count behind.
              setOpen(false);
              reset();
            }}
          >
            Avbryt
          </Button>
          <Button
            type="button"
            onClick={() => {
              void submit();
            }}
            disabled={counted === null}
            isPending={stocktake.isPending}
          >
            Bokför inventering
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
