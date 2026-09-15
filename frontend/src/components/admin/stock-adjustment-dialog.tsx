'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { SlidersHorizontalIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useForm } from 'react-hook-form';
import {
  UNIT_LABELS,
  stockAdjustmentInputSchema,
  type StockAdjustmentInput,
  type UnitValue,
} from 'shared';
import { FormField, type FormFieldControlProps } from '@/components/form/form-field';
import { QuantityInput } from '@/components/form/quantity-input';
import { notifyError, notifySuccess, notifyWarning } from '@/components/admin/notify';
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
import { Textarea } from '@/components/ui/textarea';
import { formatQuantityForInput } from '@/lib/form/quantity-input';
import { useStockAdjustment } from '@/lib/api/articles';

const DEFAULT_VALUES: StockAdjustmentInput = { quantity: '0', note: '' };

/**
 * F7.3.4 — "Justera lager": a manual, signed correction distinct from a
 * stocktake. A stocktake takes what was counted and the server derives the
 * delta; here the delta itself is the input, for corrections that are not a
 * physical count (a damaged part written off, a wrong delivery reversed).
 * §6.4/CLAUDE.md: `note` is required, because an unexplained stock movement
 * is exactly what the ledger exists to prevent.
 */
export function StockAdjustmentDialog({
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
  const adjustStock = useStockAdjustment(articleId);
  const unitLabel = UNIT_LABELS[unit];
  const form = useForm<StockAdjustmentInput>({
    resolver: zodResolver(stockAdjustmentInputSchema),
    defaultValues: DEFAULT_VALUES,
  });

  async function submit(input: StockAdjustmentInput): Promise<void> {
    try {
      const result = await adjustStock.mutateAsync(input);
      if (result.warnings.length > 0) {
        notifyWarning(result.warnings.join(' '));
      } else {
        notifySuccess(
          `Lager justerat.`,
          `Nytt saldo: ${formatQuantityForInput(result.movement.balanceAfter)} ${unitLabel}.`,
        );
      }
      setOpen(false);
      form.reset(DEFAULT_VALUES);
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
          form.reset(DEFAULT_VALUES);
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
          <SlidersHorizontalIcon aria-hidden="true" />
          Justera lager
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Justera lager</DialogTitle>
          <DialogDescription>
            Nuvarande saldo: {formatQuantityForInput(currentQuantity)}{' '}
            {unitLabel}. Ange ändringen som ett plus- eller minustal.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            void form.handleSubmit(submit)(event);
          }}
        >
          <FormField
            control={form.control}
            name="quantity"
            label="Ändring"
            required
          >
            {({
              field,
              aria,
            }: FormFieldControlProps<StockAdjustmentInput, 'quantity'>) => (
              <QuantityInput
                {...aria}
                value={field.value}
                onChange={(value: string | null) => {
                  field.onChange(value ?? '0');
                }}
                onBlur={field.onBlur}
                unit={unit}
              />
            )}
          </FormField>

          <FormField
            control={form.control}
            name="note"
            label="Anteckning"
            required
            description="Varför lagret ändras. Syns i artikelns rörelsehistorik."
          >
            {({
              field,
              aria,
            }: FormFieldControlProps<StockAdjustmentInput, 'note'>) => (
              <Textarea {...aria} {...field} />
            )}
          </FormField>

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                // A plain button, not `DialogClose` — Escape/overlay/the ×
                // button all fire `onOpenChange` and reset there, but this
                // one does not, and would leave a half-entered adjustment
                // behind for the next time the dialog opens.
                setOpen(false);
                form.reset(DEFAULT_VALUES);
              }}
            >
              Avbryt
            </Button>
            <Button type="submit" isPending={form.formState.isSubmitting}>
              Bokför justering
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
