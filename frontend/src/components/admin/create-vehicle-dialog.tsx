'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2Icon, PlusIcon, SearchIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  createVehicleInputSchema,
  isNormalisedRegNr,
  normaliseRegNr,
  vehicleLookupResponseSchema,
  type CreateVehicleInput,
  type Vehicle,
} from 'shared';
import { FormField, type FormFieldControlProps } from '@/components/form/form-field';
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
import { apiFetch } from '@/lib/api/client';
import { useCreateVehicle } from '@/lib/api/vehicles';
import { usePublicFormToken } from '@/lib/public/use-public-form-token';

function defaultValues(customerId: string | undefined): CreateVehicleInput {
  return {
    registrationNumber: '',
    make: '',
    model: '',
    ...(customerId === undefined ? {} : { customerId }),
  };
}

type LookupState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'unavailable' };

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
  const [lookupState, setLookupState] = useState<LookupState>({ kind: 'idle' });
  const router = useRouter();
  const createVehicle = useCreateVehicle();
  const lookupToken = usePublicFormToken({
    purpose: 'vehicle-lookup',
    eager: false,
  });
  const form = useForm<CreateVehicleInput>({
    resolver: zodResolver(createVehicleInputSchema),
    defaultValues: defaultValues(customerId),
  });
  const registrationNumber = useWatch({
    control: form.control,
    name: 'registrationNumber',
  });
  const canLookUp =
    registrationNumber.trim() !== '' &&
    isNormalisedRegNr(normaliseRegNr(registrationNumber));

  /**
   * F8.7.1 — there is no staff endpoint for a vehicle that does not exist
   * yet (`POST /vehicles/:id/vehicle-data/refresh` needs an id); this reuses
   * the same public, form-token-gated lookup the homepage hero calls
   * (§6.1), and shares its rate limit. `POST /vehicles` still runs
   * afterwards to actually create the record — this only pre-fills it.
   */
  async function lookUp(): Promise<void> {
    setLookupState({ kind: 'loading' });
    try {
      const formToken = await lookupToken.getToken();
      const result = await apiFetch(
        '/public/vehicle-lookup',
        vehicleLookupResponseSchema,
        {
          method: 'POST',
          body: { registrationNumber, formToken },
        },
      );
      if (result.data === null) {
        setLookupState({
          kind:
            result.source === 'UNAVAILABLE' ? 'unavailable' : 'not-found',
        });
        return;
      }
      const data = result.data;
      form.reset({
        ...form.getValues(),
        make: data.make,
        model: data.model,
        ...(data.variant === null ? {} : { variant: data.variant }),
        ...(data.modelYear === null ? {} : { modelYear: data.modelYear }),
        ...(data.vin === null ? {} : { vin: data.vin }),
        ...(data.engineCode === null ? {} : { engineCode: data.engineCode }),
        ...(data.fuelType === null ? {} : { fuelType: data.fuelType }),
        ...(data.firstRegistrationDate === null
          ? {}
          : { firstRegistrationDate: data.firstRegistrationDate }),
        ...(data.lastInspectionDate === null
          ? {}
          : { lastInspectionDate: data.lastInspectionDate }),
        ...(data.nextInspectionDueDate === null
          ? {}
          : { nextInspectionDueDate: data.nextInspectionDueDate }),
      });
      setLookupState({ kind: 'idle' });
      notifySuccess(`Biluppgifter hämtade för ${data.make} ${data.model}.`);
    } catch (error) {
      setLookupState({ kind: 'unavailable' });
      notifyError(error);
    }
  }

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
      onOpenChange={(nextOpen: boolean) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          form.reset(defaultValues(customerId));
          setLookupState({ kind: 'idle' });
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
            {({
              field,
              aria,
            }: FormFieldControlProps<CreateVehicleInput, 'registrationNumber'>) => (
              <RegNrInput
                {...aria}
                value={field.value}
                onChange={(value: string) => {
                  field.onChange(value);
                  setLookupState({ kind: 'idle' });
                }}
                onBlur={field.onBlur}
              />
            )}
          </FormField>

          {/*
           * F8.7.1 — never triggered automatically from typing a plate
           * (§7.1): a human presses this, exactly once per lookup.
           */}
          <div className="flex flex-col gap-1.5">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="self-start"
              disabled={!canLookUp || lookupState.kind === 'loading'}
              onClick={() => {
                void lookUp();
              }}
            >
              {lookupState.kind === 'loading' ? (
                <Loader2Icon aria-hidden="true" className="animate-spin" />
              ) : (
                <SearchIcon aria-hidden="true" />
              )}
              Hämta biluppgifter
            </Button>
            {lookupState.kind === 'not-found' ? (
              <p className="text-sm text-muted-foreground">
                Ingen bil hittades med det registreringsnumret.
              </p>
            ) : null}
            {lookupState.kind === 'unavailable' ? (
              <p className="text-sm text-muted-foreground">
                Biluppgifterna är tillfälligt otillgängliga. Fyll i uppgifterna
                manuellt.
              </p>
            ) : null}
          </div>

          <FormField control={form.control} name="make" label="Märke" required>
            {({ field, aria }: FormFieldControlProps<CreateVehicleInput, 'make'>) => (
              <Input {...aria} {...field} />
            )}
          </FormField>

          <FormField control={form.control} name="model" label="Modell" required>
            {({ field, aria }: FormFieldControlProps<CreateVehicleInput, 'model'>) => (
              <Input {...aria} {...field} />
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
              Skapa fordon
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
