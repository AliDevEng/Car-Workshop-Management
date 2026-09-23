'use client';

import { SearchIcon, UserRoundIcon } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import {
  normalisePhone,
  stockholmDate,
  stockholmWallClockToUtc,
  type BookingCustomerInput,
  type BookingVehicleInput,
  type BookingWithRelations,
  type CustomerListItem,
  type UserSummary,
  type Vehicle,
} from 'shared';
import {
  BookingSlotAvailabilityPanel,
  useBookingSlotAvailability,
} from '@/components/admin/booking-slot-availability';
import { isConflictError } from '@/components/admin/conflict';
import { notifyError, notifySuccess } from '@/components/admin/notify';
import {
  EMPTY_VEHICLE_MODEL_PICKER,
  resolveVehicleMakeModel,
  VehicleModelPicker,
  type VehicleModelPickerValue,
} from '@/components/admin/vehicle-model-picker';
import { DatePicker } from '@/components/form/date-picker';
import { RegNrInput } from '@/components/form/reg-nr-input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  BOOKING_DURATION_OPTIONS_MINUTES,
  addMinutesToLocalDateTime,
  defaultBookingStart,
  formatDurationMinutes,
  isPastLocalDateTime,
} from '@/lib/admin/calendar';
import {
  useDebouncedSearch,
  useDebouncedValue,
} from '@/lib/admin/use-debounced-search';
import { useCreateBooking } from '@/lib/api/bookings';
import { useCustomers } from '@/lib/api/customers';
import { useUserRoster } from '@/lib/api/users';
import { useVehicles } from '@/lib/api/vehicles';
import { formatDate, formatTime } from '@/lib/format/date';

/**
 * "Ny bokning" — the customer rings, and whoever answers writes them straight
 * into the calendar.
 *
 * This is the commonest way a booking is made in a two-person workshop, and
 * until now it had no screen: the only route into the calendar was confirming
 * a request that had arrived from the public website. §6.2's rule that a
 * *public submission* never becomes a booking directly is untouched — what
 * this adds is the staff-side path that rule always assumed existed.
 *
 * **What is required here is decided by the columns, not by preference.**
 * `Booking.customerId` is `NOT NULL` because the calendar is a promise to a
 * person, and `Customer.phone` is `NOT NULL` because §4.2 makes the telephone
 * the required contact channel — and a caller, by definition, has one. Time,
 * name and number are therefore the whole of it. The car is optional, and so
 * is every field describing it: a customer who has not read their plate off
 * the key ring still gets a time.
 */

const UNASSIGNED = 'UNASSIGNED' as const;
const DEFAULT_DURATION_MINUTES = 60;

/**
 * A model year is optional, and an out-of-range one must be caught here
 * rather than by the server: `modelYearSchema` bounds it to 1900–2100, and a
 * `400` naming `vehicle.modelYear` would arrive as a toast with no field to
 * attach itself to. `Number.parseInt` is deliberately not used — it reads
 * `2014abc` as 2014, which silently stores a year nobody typed.
 */
const MODEL_YEAR_PATTERN = /^\d{4}$/;
const MODEL_YEAR_MIN = 1900;
const MODEL_YEAR_MAX = 2100;

function parseModelYear(value: string): number | undefined {
  const trimmed = value.trim();
  if (!MODEL_YEAR_PATTERN.test(trimmed)) {
    return undefined;
  }
  const year = Number(trimmed);
  return year >= MODEL_YEAR_MIN && year <= MODEL_YEAR_MAX ? year : undefined;
}

type CustomerMode = 'NEW' | 'EXISTING';
type VehicleMode = 'NONE' | 'NEW' | 'EXISTING';

function CustomerSearch({
  selected,
  onSelect,
}: {
  readonly selected: CustomerListItem | null;
  readonly onSelect: (customer: CustomerListItem | null) => void;
}) {
  const [input, query, setInput] = useDebouncedSearch();
  const searchQuery = useCustomers(
    { q: query, limit: 8 },
    {
      enabled: query !== '',
    },
  );

  if (selected !== null) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-sharp border border-border p-3">
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">
            {selected.name}
          </span>
          <span className="block truncate text-xs text-muted-foreground tabular-nums">
            {selected.phone}
          </span>
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            onSelect(null);
          }}
        >
          Byt kund
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <SearchIcon
          aria-hidden="true"
          className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          autoFocus
          value={input}
          aria-label="Sök kund på namn eller telefon"
          placeholder="Sök kund på namn eller telefon"
          className="pl-9"
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            setInput(event.currentTarget.value);
          }}
        />
      </div>
      <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
        {searchQuery.data?.data.map((customer: CustomerListItem) => (
          <button
            key={customer.id}
            type="button"
            onClick={() => {
              onSelect(customer);
              setInput('');
            }}
            className="grid min-h-11 grid-cols-[20px_minmax(0,1fr)] items-center gap-3 rounded-sharp px-2 text-left hover:bg-accent focus-visible:bg-accent"
          >
            <UserRoundIcon
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {customer.name}
              </span>
              <span className="block truncate text-xs text-muted-foreground tabular-nums">
                {customer.phone}
              </span>
            </span>
          </button>
        ))}
        {query !== '' && (searchQuery.data?.data.length ?? 0) === 0 ? (
          <p className="px-2 py-2 text-sm text-muted-foreground">
            Ingen kund matchar sökningen. Välj “Ny kund” i stället.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function VehicleSearch({
  selected,
  onSelect,
}: {
  readonly selected: Vehicle | null;
  readonly onSelect: (vehicle: Vehicle | null) => void;
}) {
  const [input, query, setInput] = useDebouncedSearch();
  const searchQuery = useVehicles(
    { q: query, limit: 8 },
    {
      enabled: query !== '',
    },
  );

  if (selected !== null) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-sharp border border-border p-3">
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium tabular-nums">
            {selected.registrationNumberDisplay}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {selected.make} {selected.model}
          </span>
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            onSelect(null);
          }}
        >
          Byt fordon
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={input}
        aria-label="Sök fordon på registreringsnummer"
        placeholder="Sök fordon på registreringsnummer"
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          setInput(event.currentTarget.value);
        }}
      />
      <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
        {searchQuery.data?.data.map((vehicle: Vehicle) => (
          <button
            key={vehicle.id}
            type="button"
            onClick={() => {
              onSelect(vehicle);
              setInput('');
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
        {query !== '' && (searchQuery.data?.data.length ?? 0) === 0 ? (
          <p className="px-2 py-2 text-sm text-muted-foreground">
            Inget fordon matchar sökningen. Välj “Nytt fordon” i stället.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function CreateBookingDialog({
  open,
  onOpenChange,
  initialDate,
  initialAssignedUserId,
  onCreated,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The day the calendar is showing, so the dialog opens on it. */
  readonly initialDate?: string;
  readonly initialAssignedUserId?: string;
  readonly onCreated?: (booking: BookingWithRelations) => void;
}) {
  /*
   * Both derived once, on mount, from the day the calendar was showing. The
   * dialog is mounted only while open, so "once" is once per opening — and
   * opening it at a flat 08:00 meant every call taken after breakfast met a
   * red "tiden har redan passerat" and a disabled button before anything had
   * been typed.
   */
  const [initial] = useState(() =>
    defaultBookingStart(initialDate ?? stockholmDate(new Date())),
  );
  const [date, setDate] = useState<string | null>(initial.date);
  const [startTime, setStartTime] = useState(initial.startTime);
  const [durationMinutes, setDurationMinutes] = useState<number>(
    DEFAULT_DURATION_MINUTES,
  );
  const [assignedUserId, setAssignedUserId] = useState<string>(
    initialAssignedUserId ?? UNASSIGNED,
  );

  const [customerMode, setCustomerMode] = useState<CustomerMode>('NEW');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [existingCustomer, setExistingCustomer] =
    useState<CustomerListItem | null>(null);

  const [vehicleMode, setVehicleMode] = useState<VehicleMode>('NEW');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [modelPicker, setModelPicker] = useState<VehicleModelPickerValue>(
    EMPTY_VEHICLE_MODEL_PICKER,
  );
  const [modelYear, setModelYear] = useState('');
  const [existingVehicle, setExistingVehicle] = useState<Vehicle | null>(null);

  const [note, setNote] = useState('');
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);

  const rosterQuery = useUserRoster();
  const createBooking = useCreateBooking();

  const localStart = date === null ? null : `${date}T${startTime}`;
  const localEnd =
    localStart === null
      ? null
      : addMinutesToLocalDateTime(localStart, durationMinutes);
  const isPast = localStart !== null && isPastLocalDateTime(localStart);
  const mechanicFilter = assignedUserId === UNASSIGNED ? null : assignedUserId;

  const availability = useBookingSlotAvailability({
    date,
    localStart,
    localEnd,
    assignedUserId: mechanicFilter,
  });

  const trimmedName = customerName.trim();
  const trimmedPhone = customerPhone.trim();

  /*
   * A returning caller is matched on their telephone number by the server
   * (§8.2), which is what keeps one customer from becoming five rows. Showing
   * the match here means the staff member sees *which* record they are about
   * to add to before they commit, rather than discovering it afterwards.
   *
   * Debounced, because this fires while a number is being typed and an
   * un-debounced version was a request per keystroke.
   */
  const [debouncedPhone] = useDebouncedValue(trimmedPhone);
  const phoneMatchQuery = useCustomers(
    { q: debouncedPhone, limit: 5 },
    { enabled: customerMode === 'NEW' && debouncedPhone.length >= 6 },
  );

  /*
   * Narrowed to an **exact** normalised match, and this matters.
   * `GET /api/customers?q=` is a fuzzy `ILIKE '%q%'` across both phone
   * columns (§8.2), so `070-555 90` happily returns a customer whose number
   * merely contains those digits. The server, by contrast, reuses a customer
   * only on an exact `phoneNormalised` equality — so the looser match would
   * have promised "bokningen läggs på den kunden" about somebody the server
   * was never going to pick, which is worse than saying nothing.
   */
  const normalisedTypedPhone = normalisePhone(debouncedPhone);
  const phoneMatch =
    customerMode === 'NEW' && normalisedTypedPhone !== ''
      ? (phoneMatchQuery.data?.data.find(
          (candidate: CustomerListItem) =>
            candidate.isActive &&
            normalisePhone(candidate.phone) === normalisedTypedPhone,
        ) ?? null)
      : null;
  /*
   * Typed, but not a usable year. Blocking submission is the point: silently
   * dropping it would create the vehicle without the year the staff member
   * believes they entered, and sending it would be a `400` with nowhere to
   * render itself.
   */
  const modelYearIsWrong =
    modelYear.trim() !== '' && parseModelYear(modelYear) === undefined;

  const customerReady =
    customerMode === 'EXISTING'
      ? existingCustomer !== null
      : trimmedName !== '' && trimmedPhone.length >= 6;
  const vehicleReady =
    vehicleMode === 'EXISTING'
      ? existingVehicle !== null
      : vehicleMode === 'NEW'
        ? // Only the plate. The make and model are a convenience — the server
          // names an unknown car "Okänt fabrikat" and a human corrects it.
          registrationNumber !== ''
        : true;

  const readyToSubmit =
    date !== null &&
    !isPast &&
    customerReady &&
    vehicleReady &&
    !modelYearIsWrong;

  function customerInput(): BookingCustomerInput {
    if (customerMode === 'EXISTING' && existingCustomer !== null) {
      return { mode: 'EXISTING', customerId: existingCustomer.id };
    }
    const email = customerEmail.trim();
    return {
      mode: 'NEW',
      name: trimmedName,
      phone: trimmedPhone,
      ...(email === '' ? {} : { email }),
    };
  }

  function vehicleInput(): BookingVehicleInput {
    if (vehicleMode === 'EXISTING' && existingVehicle !== null) {
      return { mode: 'EXISTING', vehicleId: existingVehicle.id };
    }
    if (vehicleMode !== 'NEW' || registrationNumber === '') {
      return { mode: 'NONE' };
    }
    const { make, model } = resolveVehicleMakeModel(modelPicker);
    const year = parseModelYear(modelYear);
    return {
      mode: 'NEW',
      registrationNumber,
      ...(make === undefined ? {} : { make }),
      // A model without a make would be stored under "Okänt fabrikat", which
      // reads as nonsense on a protocol. The pair travels together or not at
      // all.
      ...(make === undefined || model === undefined ? {} : { model }),
      ...(year === undefined ? {} : { modelYear: year }),
    };
  }

  async function handleCreate(): Promise<void> {
    if (localStart === null || localEnd === null || isPast) {
      return;
    }
    setConflictMessage(null);
    try {
      const booking = await createBooking.mutateAsync({
        startsAt: stockholmWallClockToUtc(localStart).toISOString(),
        endsAt: stockholmWallClockToUtc(localEnd).toISOString(),
        ...(assignedUserId === UNASSIGNED ? {} : { assignedUserId }),
        customer: customerInput(),
        vehicle: vehicleInput(),
        ...(note.trim() === '' ? {} : { note: note.trim() }),
      });
      notifySuccess(
        `Bokningen är skapad: ${formatDate(booking.startsAt)} kl ${formatTime(
          booking.startsAt,
        )}.`,
      );
      onOpenChange(false);
      onCreated?.(booking);
    } catch (error) {
      // The `409` from the exclusion constraint carries its own Swedish
      // explanation, shown inline where the slot was chosen rather than
      // replaced by a generic toast (the same rule F8.2.4 set).
      if (isConflictError(error)) {
        setConflictMessage(error.message);
        return;
      }
      notifyError(error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ny bokning</DialogTitle>
          <DialogDescription>
            För en kund som ringer in. Tid, namn och telefonnummer räcker —
            fordonet kan fyllas i senare.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {/* --- When ------------------------------------------------- */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Datum</span>
              <DatePicker value={date} onChange={setDate} disablePast />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="create-booking-start-time"
                className="text-sm font-medium"
              >
                Starttid
              </label>
              <Input
                id="create-booking-start-time"
                type="time"
                value={startTime}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  setStartTime(event.currentTarget.value);
                }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span
                className="text-sm font-medium"
                id="create-booking-duration"
              >
                Längd
              </span>
              <Select
                value={String(durationMinutes)}
                onValueChange={(next: string) => {
                  setDurationMinutes(Number(next));
                }}
              >
                <SelectTrigger
                  className="w-full"
                  aria-labelledby="create-booking-duration"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BOOKING_DURATION_OPTIONS_MINUTES.map((minutes: number) => (
                    <SelectItem key={minutes} value={String(minutes)}>
                      {formatDurationMinutes(minutes)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <span
                className="text-sm font-medium"
                id="create-booking-mechanic"
              >
                Mekaniker
              </span>
              <Select value={assignedUserId} onValueChange={setAssignedUserId}>
                <SelectTrigger
                  className="w-full"
                  aria-labelledby="create-booking-mechanic"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Ej tilldelad</SelectItem>
                  {rosterQuery.data?.data.map((user: UserSummary) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isPast ? (
            <p role="alert" className="text-sm text-destructive">
              Den valda tiden har redan passerat. Välj en tid i framtiden.
            </p>
          ) : null}

          {date === null ? null : (
            <BookingSlotAvailabilityPanel
              availability={availability}
              assignedUserId={mechanicFilter}
            />
          )}

          {availability.overlapping.length > 0 ? (
            <p role="alert" className="text-sm text-destructive">
              Krockar med en befintlig bokning ovan. Bokningen kan ändå nekas av
              servern om tiden inte längre är ledig.
            </p>
          ) : null}

          {conflictMessage !== null ? (
            <p role="alert" className="text-sm text-destructive">
              {conflictMessage}
            </p>
          ) : null}

          {/* --- Who -------------------------------------------------- */}
          <div className="flex flex-col gap-3 rounded-sharp border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Kund
              </span>
              <Tabs
                value={customerMode}
                onValueChange={(next: string) => {
                  setCustomerMode(next as CustomerMode);
                }}
              >
                <TabsList>
                  <TabsTrigger value="NEW">Ny kund</TabsTrigger>
                  <TabsTrigger value="EXISTING">Befintlig</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {customerMode === 'EXISTING' ? (
              <CustomerSearch
                selected={existingCustomer}
                onSelect={setExistingCustomer}
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="create-booking-customer-name"
                    className="text-sm font-medium"
                  >
                    Namn
                  </label>
                  <Input
                    id="create-booking-customer-name"
                    value={customerName}
                    autoComplete="off"
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setCustomerName(event.currentTarget.value);
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="create-booking-customer-phone"
                    className="text-sm font-medium"
                  >
                    Telefon
                  </label>
                  <Input
                    id="create-booking-customer-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="off"
                    className="tabular-nums"
                    value={customerPhone}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setCustomerPhone(event.currentTarget.value);
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label
                    htmlFor="create-booking-customer-email"
                    className="text-sm font-medium"
                  >
                    E-post{' '}
                    <span className="font-normal text-muted-foreground">
                      (valfritt)
                    </span>
                  </label>
                  <Input
                    id="create-booking-customer-email"
                    type="email"
                    autoComplete="off"
                    value={customerEmail}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setCustomerEmail(event.currentTarget.value);
                    }}
                  />
                </div>
              </div>
            )}

            {phoneMatch !== null ? (
              <p className="text-xs text-muted-foreground">
                Telefonnumret finns redan på {phoneMatch.name}. Bokningen läggs
                på den kunden i stället för att skapa en till.
              </p>
            ) : null}
          </div>

          {/* --- What car --------------------------------------------- */}
          <div className="flex flex-col gap-3 rounded-sharp border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Fordon
              </span>
              <Tabs
                value={vehicleMode}
                onValueChange={(next: string) => {
                  setVehicleMode(next as VehicleMode);
                }}
              >
                <TabsList>
                  <TabsTrigger value="NEW">Nytt</TabsTrigger>
                  <TabsTrigger value="EXISTING">Befintligt</TabsTrigger>
                  <TabsTrigger value="NONE">Inget</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {vehicleMode === 'NONE' ? (
              <p className="text-sm text-muted-foreground">
                Bokningen skapas utan fordon. Koppla bilen när kunden kommer in.
              </p>
            ) : vehicleMode === 'EXISTING' ? (
              <VehicleSearch
                selected={existingVehicle}
                onSelect={setExistingVehicle}
              />
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="create-booking-regnr"
                    className="text-sm font-medium"
                  >
                    Registreringsnummer
                  </label>
                  <RegNrInput
                    id="create-booking-regnr"
                    value={registrationNumber}
                    onChange={setRegistrationNumber}
                  />
                </div>

                <VehicleModelPicker
                  idPrefix="create-booking"
                  value={modelPicker}
                  onChange={setModelPicker}
                />

                <div className="flex flex-col gap-1.5 sm:w-40">
                  <label
                    htmlFor="create-booking-model-year"
                    className="text-sm font-medium"
                  >
                    Årsmodell{' '}
                    <span className="font-normal text-muted-foreground">
                      (valfritt)
                    </span>
                  </label>
                  <Input
                    id="create-booking-model-year"
                    inputMode="numeric"
                    className="tabular-nums"
                    placeholder="2014"
                    value={modelYear}
                    aria-invalid={modelYearIsWrong}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setModelYear(event.currentTarget.value);
                    }}
                  />
                  {modelYearIsWrong ? (
                    <p role="alert" className="text-xs text-destructive">
                      Ange årsmodellen med fyra siffror, mellan{' '}
                      {String(MODEL_YEAR_MIN)} och {String(MODEL_YEAR_MAX)}.
                    </p>
                  ) : null}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="create-booking-note"
              className="text-sm font-medium"
            >
              Anteckning
            </label>
            <Textarea
              id="create-booking-note"
              value={note}
              placeholder="Vad ringde kunden om? Syns internt."
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                setNote(event.currentTarget.value);
              }}
            />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Avbryt
          </Button>
          <Button
            type="button"
            disabled={!readyToSubmit}
            isPending={createBooking.isPending}
            onClick={() => {
              void handleCreate();
            }}
          >
            Skapa bokning
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
