'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  ODOMETER_MIN_KM,
  createOdometerReadingInputSchema,
  type CreateOdometerReadingInput,
} from 'shared';
import { FormField } from '@/components/form/form-field';
import { OdometerInput } from '@/components/form/odometer-input';
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
import { useRecordOdometerReading } from '@/lib/api/vehicles';

/** F6.4.7's history needs new readings to show; B3.3's manual endpoint. */
export function RecordOdometerReadingDialog({
  vehicleId,
  currentKm,
}: {
  readonly vehicleId: string;
  readonly currentKm: number | null;
}) {
  const [open, setOpen] = useState(false);
  const recordReading = useRecordOdometerReading(vehicleId);
  const form = useForm<CreateOdometerReadingInput>({
    resolver: zodResolver(createOdometerReadingInputSchema),
    defaultValues: { km: currentKm ?? ODOMETER_MIN_KM },
  });

  async function submit(input: CreateOdometerReadingInput): Promise<void> {
    try {
      const response = await recordReading.mutateAsync(input);
      if (response.warnings.length > 0) {
        notifyWarning(response.warnings.join(' '));
      } else {
        notifySuccess('Mätarställningen är sparad.');
      }
      setOpen(false);
      form.reset({ km: input.km });
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
          form.reset({ km: currentKm ?? ODOMETER_MIN_KM });
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" size="sm">
          <PlusIcon aria-hidden="true" />
          Ny avläsning
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Ny mätarställning</DialogTitle>
          <DialogDescription>
            Sparas som en manuell avläsning med dagens datum.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            void form.handleSubmit(submit)(event);
          }}
        >
          <FormField
            control={form.control}
            name="km"
            label="Mätarställning"
            required
          >
            {({ field, aria }) => (
              <OdometerInput
                {...aria}
                value={field.value}
                onChange={(value) => {
                  field.onChange(value ?? 0);
                }}
                onBlur={field.onBlur}
              />
            )}
          </FormField>

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
            <Button type="submit" isPending={form.formState.isSubmitting}>
              Spara avläsning
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
