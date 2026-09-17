'use client';

import { PlusIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, type FormEvent, useState } from 'react';
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
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useCreateQuote } from '@/lib/api/quotes';

/**
 * F10.1.1 — "Skapa offert" from a work order, snapshotting its current
 * lines. `validUntil` is the only field the backend's
 * `createQuoteInputSchema` accepts beyond the work order itself: the
 * §4.2 `Quote` entity carries no free-text "terms" field, so F10.1.2's
 * mention of one is corrected here rather than invented client-side
 * (CLAUDE.md: ask, don't invent a requirement — and this one is answered by
 * the contract itself, not by guessing). Left blank, the backend applies the
 * workshop's own `quoteValidityDays` setting.
 */
export function CreateQuoteDialog({
  workOrderId,
  disabled = false,
}: {
  readonly workOrderId: string;
  readonly disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [validUntil, setValidUntil] = useState('');
  const router = useRouter();
  const createQuote = useCreateQuote(workOrderId);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    try {
      const response = await createQuote.mutateAsync(
        validUntil === '' ? {} : { validUntil },
      );
      notifySuccess('Offerten är skapad som utkast.');
      setOpen(false);
      setValidUntil('');
      router.push(`/admin/arbetsordrar/${workOrderId}/offerter/${response.quote.id}`);
    } catch (error) {
      notifyError(error);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setValidUntil('');
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" size="sm" disabled={disabled}>
          <PlusIcon aria-hidden="true" />
          Skapa offert
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Skapa offert</DialogTitle>
          <DialogDescription>
            Offerten tar en ögonblicksbild av arbetsorderns nuvarande rader.
            Utkastet kan justeras innan det skickas.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
          <Field>
            <FieldLabel htmlFor="quote-valid-until">Giltig till</FieldLabel>
            <FieldDescription>
              Lämna tomt för att använda verkstadens standardgiltighet.
            </FieldDescription>
            <Input
              id="quote-valid-until"
              type="date"
              value={validUntil}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setValidUntil(event.currentTarget.value);
              }}
            />
          </Field>

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setOpen(false);
              }}
            >
              Avbryt
            </Button>
            <Button type="submit" isPending={createQuote.isPending}>
              Skapa offert
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
