'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { PlusIcon, SearchIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import {
  createVehicleInputSchema,
  type CreateVehicleInput,
  type Vehicle,
} from 'shared';
import { FormField } from '@/components/form/form-field';
import { RegNrInput } from '@/components/form/reg-nr-input';
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
import { Input } from '@/components/ui/input';
import { useCreateVehicle } from '@/lib/api/vehicles';

function defaultValues(customerId: string | undefined): CreateVehicleInput {
  return {
    registrationNumber: '',
    make: '',
    model: '',
    ...(customerId === undefined ? {} : { customerId }),
  };
}

/**
 * F6.5.1 — a registration number, a make and a model is all a mechanic has
 * when a car rolls in; everything else is filled in later on the vehicle
 * page. `make`/`model` are required here, not optional as an earlier draft of
 * frontend/README.md's F6.5.1 said — corrected to match §4.2's field list and
 * the `Vehicle.make`/`Vehicle.model` columns, which B3 already ships as
 * `NOT NULL` (CLAUDE.md: the spec wins over a README, corrected in the same
 * commit as the code that depends on it).
 */
export function CreateVehicleDialog({
  customerId,
  trigger,
  onCreated,
}: {
  /** Preset and hidden when opened from a customer's own vehicles card. */
  readonly customerId?: string;
  readonly trigger?: ReactNode;
  readonly onCreated?: (vehicle: Vehicle) => void;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const createVehicle = useCreateVehicle();
  const form = useForm<CreateVehicleInput>({
    resolver: zodResolver(createVehicleInputSchema),
    defaultValues: defaultValues(customerId),
  });

  async function submit(input: CreateVehicleInput): Promise<void> {
    try {
      const created = await createVehicle.mutateAsync(input);
      notifySuccess(`${created.registrationNumberDisplay} har lagts till.`);
      setOpen(false);
      form.reset(defaultValues(customerId));
      onCreated?.(created);
      router.push(`/admin/fordon/${created.id}`);
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
          form.reset(defaultValues(customerId));
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button">
            <PlusIcon aria-hidden="true" />
            Nytt fordon
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nytt fordon</DialogTitle>
          <DialogDescription>
            Registreringsnummer, märke och modell räcker för att komma igång.
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
            name="registrationNumber"
            label="Registreringsnummer"
            required
          >
            {({ field, aria }) => (
              <RegNrInput
                {...aria}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          </FormField>

          {/*
           * F6.5.2 — reserved, not wired: the explicit fetch button gets a
           * real handler in F8.7 once B10.1–B10.4's lookup exists. Disabled
           * rather than hidden, so it does not look like an oversight, and
           * never triggered automatically from typing a plate (§7.1).
           */}
          <Button type="button" variant="secondary" size="sm" disabled>
            <SearchIcon aria-hidden="true" />
            Hämta biluppgifter (från F8.7)
          </Button>

          <FormField control={form.control} name="make" label="Märke" required>
            {({ field, aria }) => <Input {...aria} {...field} />}
          </FormField>

          <FormField control={form.control} name="model" label="Modell" required>
            {({ field, aria }) => <Input {...aria} {...field} />}
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
              Skapa fordon
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
