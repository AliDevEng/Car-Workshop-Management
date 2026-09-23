'use client';

import { PlusIcon, SearchIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react';
import type { BookingWithRelations } from 'shared';
import { notifyError, notifySuccess } from '@/components/admin/notify';
import { OdometerInput } from '@/components/form/odometer-input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCustomer } from '@/lib/api/customers';
import { useUserRoster } from '@/lib/api/users';
import { useVehicles, type Vehicle } from '@/lib/api/vehicles';
import { useCreateWorkOrder } from '@/lib/api/work-orders';

const SEARCH_DEBOUNCE_MS = 250;
const UNASSIGNED = 'UNASSIGNED' as const;

export type CreateWorkOrderMode =
  | { readonly kind: 'free' }
  | { readonly kind: 'fromBooking'; readonly booking: BookingWithRelations };

function VehicleSearchField({
  selected,
  onSelect,
}: {
  readonly selected: Vehicle | null;
  readonly onSelect: (vehicle: Vehicle) => void;
}) {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(input.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [input]);

  const searchQuery = useVehicles(
    { q: query, limit: 8 },
    { enabled: query !== '' },
  );
  const results = searchQuery.data?.data ?? [];

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <SearchIcon
          aria-hidden="true"
          className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={input}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            setInput(event.currentTarget.value);
          }}
          placeholder="Sök fordon på registreringsnummer"
          aria-label="Sök fordon"
          className="pl-9"
        />
      </div>
      {query === '' ? null : (
        <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-sharp border border-border p-1">
          {results.map((vehicle: Vehicle) => (
            <button
              key={vehicle.id}
              type="button"
              onClick={() => {
                onSelect(vehicle);
                setInput('');
                setQuery('');
              }}
              className="flex min-h-11 flex-col justify-center rounded-sharp px-2 text-left hover:bg-accent focus-visible:bg-accent"
            >
              <span className="truncate text-sm font-medium tabular-nums">
                {vehicle.registrationNumberDisplay}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {vehicle.make} {vehicle.model}
              </span>
            </button>
          ))}
          {results.length === 0 ? (
            <p className="px-2 py-2 text-sm text-muted-foreground">
              Inget fordon matchar sökningen.
            </p>
          ) : null}
        </div>
      )}
      {selected === null ? null : (
        <div className="rounded-sharp border border-border p-3">
          <p className="text-sm font-medium tabular-nums">
            {selected.registrationNumberDisplay}
          </p>
          <p className="text-xs text-muted-foreground">
            {selected.make} {selected.model}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * F9.1/F9.7.2 — creating a work order.
 *
 * Two modes rather than two components: `free` searches for the vehicle
 * (mirroring `ConfirmBookingRequestDialog`'s vehicle picker), while
 * `fromBooking` locks the vehicle and customer to the booking's own — the
 * disabled "Starta arbete (kopplas i F9.7)" placeholder this activates. A
 * work order always needs both a vehicle and a customer (§6.5); a vehicle
 * with no owner is refused rather than silently creating one.
 */
export function CreateWorkOrderDialog({
  mode,
  trigger,
}: {
  readonly mode: CreateWorkOrderMode;
  readonly trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [description, setDescription] = useState('');
  const [odometerKmIn, setOdometerKmIn] = useState<number | null>(null);
  const [assignedUserId, setAssignedUserId] = useState<string>(
    mode.kind === 'fromBooking'
      ? (mode.booking.assignedUserId ?? UNASSIGNED)
      : UNASSIGNED,
  );
  const [internalNote, setInternalNote] = useState('');

  const createWorkOrder = useCreateWorkOrder();
  const rosterQuery = useUserRoster();
  const freeVehicleOwnerQuery = useCustomer(
    mode.kind === 'free' ? (vehicle?.customerId ?? null) : null,
  );

  // `Vehicle.customerId` and `Booking.vehicleId` are `optionalIdSchema` —
  // nullable, not `.optional()` — so both are normalised to `undefined` here
  // and nowhere else in this component has to remember which of the two
  // "missing" spellings a given field uses.
  const vehicleId =
    mode.kind === 'fromBooking'
      ? (mode.booking.vehicleId ?? undefined)
      : vehicle?.id;
  const customerId =
    mode.kind === 'fromBooking'
      ? mode.booking.customerId
      : (vehicle?.customerId ?? undefined);
  const ownerName =
    mode.kind === 'fromBooking'
      ? mode.booking.customer.name
      : freeVehicleOwnerQuery.data?.name;
  const missingOwner =
    mode.kind === 'free' && vehicle !== null && vehicle.customerId === null;
  const readyToSubmit =
    vehicleId !== undefined &&
    customerId !== undefined &&
    description.trim() !== '';

  function resetForm(): void {
    setVehicle(null);
    setDescription('');
    setOdometerKmIn(null);
    setAssignedUserId(
      mode.kind === 'fromBooking'
        ? (mode.booking.assignedUserId ?? UNASSIGNED)
        : UNASSIGNED,
    );
    setInternalNote('');
  }

  async function handleSubmit(): Promise<void> {
    if (
      vehicleId === undefined ||
      customerId === undefined ||
      description.trim() === ''
    ) {
      return;
    }
    try {
      const response = await createWorkOrder.mutateAsync({
        vehicleId,
        customerId,
        description: description.trim(),
        ...(mode.kind === 'fromBooking' ? { bookingId: mode.booking.id } : {}),
        ...(odometerKmIn === null ? {} : { odometerKmIn }),
        ...(assignedUserId === UNASSIGNED ? {} : { assignedUserId }),
        ...(internalNote.trim() === ''
          ? {}
          : { internalNote: internalNote.trim() }),
      });
      notifySuccess('Arbetsordern är skapad.');
      setOpen(false);
      router.push(`/admin/arbetsordrar/${response.workOrder.id}`);
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
          resetForm();
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button">
            <PlusIcon aria-hidden="true" />
            Ny arbetsorder
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode.kind === 'fromBooking' ? 'Starta arbete' : 'Ny arbetsorder'}
          </DialogTitle>
          <DialogDescription>
            {mode.kind === 'fromBooking'
              ? `Skapar en arbetsorder kopplad till ${mode.booking.customer.name}s bokning.`
              : 'Sök upp fordonet arbetsordern gäller.'}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {mode.kind === 'fromBooking' ? (
            <div className="rounded-sharp border border-border p-3">
              <p className="text-sm font-medium">
                {mode.booking.vehicle === null
                  ? 'Inget fordon kopplat'
                  : `${mode.booking.vehicle.registrationNumberDisplay} · ${mode.booking.vehicle.make} ${mode.booking.vehicle.model}`}
              </p>
              <p className="text-xs text-muted-foreground">
                {mode.booking.customer.name}
              </p>
            </div>
          ) : (
            <VehicleSearchField selected={vehicle} onSelect={setVehicle} />
          )}

          {mode.kind === 'free' && vehicle !== null ? (
            missingOwner ? (
              <p role="alert" className="text-sm text-destructive">
                Fordonet saknar en kopplad ägare. Koppla en kund till fordonet
                innan en arbetsorder kan skapas.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Ägare: {ownerName ?? '…'}
              </p>
            )
          ) : null}

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="create-wo-description"
              className="text-sm font-medium"
            >
              Beskrivning
              <span aria-hidden="true" className="text-destructive">
                *
              </span>
            </label>
            <Textarea
              id="create-wo-description"
              value={description}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                setDescription(event.currentTarget.value);
              }}
              placeholder="Vad ska göras?"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Mätarställning in</span>
              <OdometerInput
                aria-label="Mätarställning in"
                value={odometerKmIn}
                onChange={setOdometerKmIn}
                optional
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Mekaniker</span>
              <Select value={assignedUserId} onValueChange={setAssignedUserId}>
                <SelectTrigger className="w-full">
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
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="create-wo-note" className="text-sm font-medium">
              Intern anteckning
            </label>
            <Textarea
              id="create-wo-note"
              value={internalNote}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                setInternalNote(event.currentTarget.value);
              }}
              placeholder="Valfritt, synlig internt"
            />
          </div>
        </DialogBody>

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
          <Button
            type="button"
            disabled={!readyToSubmit || missingOwner}
            isPending={createWorkOrder.isPending}
            onClick={() => {
              void handleSubmit();
            }}
          >
            {mode.kind === 'fromBooking'
              ? 'Starta arbete'
              : 'Skapa arbetsorder'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
