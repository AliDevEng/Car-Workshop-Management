'use client';

import { SearchIcon, UserRoundIcon } from 'lucide-react';
import { useEffect, useState, type ChangeEvent } from 'react';
import {
  isNormalisedRegNr,
  normaliseRegNr,
  stockholmWallClockToUtc,
  type BookingRequest,
  type BookingWithRelations,
  type CustomerListItem,
  type RequestedTimeOfDay,
  type UserSummary,
  type Vehicle,
} from 'shared';
import { isConflictError } from '@/components/admin/conflict';
import { notifyError, notifySuccess } from '@/components/admin/notify';
import { DatePicker } from '@/components/form/date-picker';
import { Button } from '@/components/ui/button';
import {
  Dialog,
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
import { Textarea } from '@/components/ui/textarea';
import {
  BOOKING_DURATION_OPTIONS_MINUTES,
  addMinutesToLocalDateTime,
  calendarRangeForDay,
  formatDurationMinutes,
  isPastLocalDateTime,
} from '@/lib/admin/calendar';
import { useCalendar, useConfirmBookingRequest } from '@/lib/api/bookings';
import { useCustomers } from '@/lib/api/customers';
import { useUserRoster } from '@/lib/api/users';
import { useVehicles } from '@/lib/api/vehicles';
import { formatDate, formatTime } from '@/lib/format/date';
import { formatRegNr } from '@/lib/format/reg-nr';

const SEARCH_DEBOUNCE_MS = 250;
const UNASSIGNED = 'UNASSIGNED' as const;

function defaultStartTime(timeOfDay: RequestedTimeOfDay | null): string {
  return timeOfDay === 'AFTERNOON' ? '13:00' : '08:00';
}

/** A small debounced text search, shared by the customer and vehicle
 * pickers below — the same pattern `ReassignOwnerDialog` already uses. */
function useDebouncedSearch(
  initial = '',
): readonly [string, string, (value: string) => void] {
  const [input, setInput] = useState(initial);
  const [debounced, setDebounced] = useState(initial);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(input.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [input]);

  return [input, debounced, setInput];
}

function CustomerPicker({
  request,
  override,
  onOverride,
}: {
  readonly request: BookingRequest;
  readonly override: CustomerListItem | null;
  readonly onOverride: (customer: CustomerListItem | null) => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [input, query, setInput] = useDebouncedSearch();

  const matchQuery = useCustomers(
    { q: request.phone, limit: 3 },
    { enabled: override === null },
  );
  const matched = matchQuery.data?.data[0] ?? null;
  const searchQuery = useCustomers(
    { q: query, limit: 8 },
    { enabled: searchOpen && query !== '' },
  );

  const shown = override ?? matched;

  return (
    <div className="flex flex-col gap-2 rounded-sharp border border-border p-3">
      <p className="text-xs font-medium text-muted-foreground">Kund</p>
      {shown !== null ? (
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">
              {shown.name}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {override !== null
                ? 'Vald manuellt'
                : `Matchad på telefonnummer ${request.phone}`}
            </span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchOpen((current) => !current);
            }}
          >
            Välj annan
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Ingen befintlig kund hittades på {request.phone}. En ny kund skapas:{' '}
          {request.customerName}.
        </p>
      )}

      {shown === null ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="self-start"
          onClick={() => {
            setSearchOpen((current) => !current);
          }}
        >
          Koppla till befintlig kund
        </Button>
      ) : null}

      {searchOpen ? (
        <div className="flex flex-col gap-2">
          <div className="relative">
            <SearchIcon
              aria-hidden="true"
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              autoFocus
              value={input}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setInput(event.currentTarget.value);
              }}
              placeholder="Sök kund på namn eller telefon"
              className="pl-9"
            />
          </div>
          <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
            {searchQuery.data?.data.map((customer: CustomerListItem) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => {
                  onOverride(customer);
                  setSearchOpen(false);
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
                  <span className="block truncate text-xs text-muted-foreground">
                    {customer.phone}
                  </span>
                </span>
              </button>
            ))}
            {query !== '' && (searchQuery.data?.data.length ?? 0) === 0 ? (
              <p className="px-2 py-2 text-sm text-muted-foreground">
                Ingen kund matchar sökningen.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function VehiclePicker({
  request,
  override,
  onOverride,
}: {
  readonly request: BookingRequest;
  readonly override: Vehicle | null;
  readonly onOverride: (vehicle: Vehicle | null) => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [input, query, setInput] = useDebouncedSearch();

  const hasUsableRegNr =
    request.regNr !== null && isNormalisedRegNr(request.regNr);
  const matchQuery = useVehicles(
    { q: request.regNr ?? '', limit: 3 },
    { enabled: override === null && hasUsableRegNr },
  );
  const matched =
    matchQuery.data?.data.find(
      (vehicle: Vehicle) =>
        vehicle.registrationNumber === normaliseRegNr(request.regNr ?? ''),
    ) ?? null;
  const searchQuery = useVehicles(
    { q: query, limit: 8 },
    { enabled: searchOpen && query !== '' },
  );

  const shown = override ?? matched;

  return (
    <div className="flex flex-col gap-2 rounded-sharp border border-border p-3">
      <p className="text-xs font-medium text-muted-foreground">Fordon</p>
      {shown !== null ? (
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium tabular-nums">
              {shown.registrationNumberDisplay}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {override !== null
                ? 'Valt manuellt'
                : `Matchat på registreringsnummer`}
              {' · '}
              {shown.make} {shown.model}
            </span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchOpen((current) => !current);
            }}
          >
            Välj annat
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {request.regNr === null
            ? 'Ingen registreringsnummer angavs. Bokningen skapas utan kopplat fordon.'
            : `Inget fordon med registreringsnumret ${formatRegNr(request.regNr)} hittades. Ett nytt fordon skapas.`}
        </p>
      )}

      {shown === null ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="self-start"
          onClick={() => {
            setSearchOpen((current) => !current);
          }}
        >
          Koppla till befintligt fordon
        </Button>
      ) : null}

      {searchOpen ? (
        <div className="flex flex-col gap-2">
          <Input
            autoFocus
            value={input}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setInput(event.currentTarget.value);
            }}
            placeholder="Sök fordon på registreringsnummer"
          />
          <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
            {searchQuery.data?.data.map((vehicle: Vehicle) => (
              <button
                key={vehicle.id}
                type="button"
                onClick={() => {
                  onOverride(vehicle);
                  setSearchOpen(false);
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
                Inget fordon matchar sökningen.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * F8.2 — confirming a request into a scheduled booking.
 *
 * Meant to be mounted only while a request is selected (`{selected && <.../>}`
 * in the caller) so each open starts from fresh state rather than carrying
 * over the previous request's date, mechanic or search text.
 */
export function ConfirmBookingRequestDialog({
  request,
  open,
  onOpenChange,
  onConfirmed,
}: {
  readonly request: BookingRequest;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirmed?: (booking: BookingWithRelations) => void;
}) {
  const [date, setDate] = useState<string | null>(request.requestedDate);
  const [startTime, setStartTime] = useState(
    defaultStartTime(request.requestedTimeOfDay),
  );
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [assignedUserId, setAssignedUserId] = useState<string>(UNASSIGNED);
  const [note, setNote] = useState('');
  const [customerOverride, setCustomerOverride] =
    useState<CustomerListItem | null>(null);
  const [vehicleOverride, setVehicleOverride] = useState<Vehicle | null>(null);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);

  const rosterQuery = useUserRoster();
  const confirmRequest = useConfirmBookingRequest();

  const localStart = date === null ? null : `${date}T${startTime}`;
  const localEnd =
    localStart === null
      ? null
      : addMinutesToLocalDateTime(localStart, durationMinutes);
  const isPast = localStart !== null && isPastLocalDateTime(localStart);

  const dayAvailability = useCalendar(
    date === null ? { from: '', to: '' } : calendarRangeForDay(date),
    { enabled: date !== null },
  );
  const relevantBookings = (dayAvailability.data?.data ?? []).filter(
    (booking: BookingWithRelations) =>
      booking.status !== 'CANCELLED' &&
      booking.status !== 'NO_SHOW' &&
      (assignedUserId === UNASSIGNED ||
        booking.assignedUserId === assignedUserId),
  );
  const proposedStartMs =
    localStart === null ? null : stockholmWallClockToUtc(localStart).getTime();
  const proposedEndMs =
    localEnd === null ? null : stockholmWallClockToUtc(localEnd).getTime();
  const overlapping = relevantBookings.filter(
    (booking: BookingWithRelations) => {
      if (proposedStartMs === null || proposedEndMs === null) {
        return false;
      }
      const bookingStart = new Date(booking.startsAt).getTime();
      const bookingEnd = new Date(booking.endsAt).getTime();
      return proposedStartMs < bookingEnd && bookingStart < proposedEndMs;
    },
  );

  // A mechanic is optional (`UNASSIGNED` occupies nobody's calendar and so
  // cannot conflict, mirroring the exclusion constraint's own partial index).
  const readyToSubmit = date !== null && !isPast;

  async function handleConfirm(): Promise<void> {
    if (localStart === null || localEnd === null || isPast) {
      return;
    }
    setConflictMessage(null);
    try {
      const booking = await confirmRequest.mutateAsync({
        id: request.id,
        input: {
          startsAt: stockholmWallClockToUtc(localStart).toISOString(),
          endsAt: stockholmWallClockToUtc(localEnd).toISOString(),
          ...(assignedUserId === UNASSIGNED ? {} : { assignedUserId }),
          ...(customerOverride === null
            ? {}
            : { customerId: customerOverride.id }),
          ...(vehicleOverride === null
            ? {}
            : { vehicleId: vehicleOverride.id }),
          ...(note.trim() === '' ? {} : { note: note.trim() }),
        },
      });
      notifySuccess(
        `Bokningen är bekräftad till ${formatDate(booking.startsAt)} kl ${formatTime(booking.startsAt)}.`,
      );
      onOpenChange(false);
      onConfirmed?.(booking);
    } catch (error) {
      // The `409` from the exclusion constraint already carries a specific,
      // Swedish explanation (`BOOKING_OVERLAP_MESSAGE`) — shown inline,
      // rather than replaced with a generic message, per F8.2.4. Anything
      // else goes through the normal toast path.
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
          <DialogTitle>Bekräfta bokning</DialogTitle>
          <DialogDescription>
            Från {request.customerName}, inkommen{' '}
            {formatDate(request.submittedAt)}.
            {request.message === null ? '' : ` "${request.message}"`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1">
          <CustomerPicker
            request={request}
            override={customerOverride}
            onOverride={setCustomerOverride}
          />
          <VehiclePicker
            request={request}
            override={vehicleOverride}
            onOverride={setVehicleOverride}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Datum</span>
              <DatePicker value={date} onChange={setDate} disablePast />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="confirm-booking-start-time"
                className="text-sm font-medium"
              >
                Starttid
              </label>
              <Input
                id="confirm-booking-start-time"
                type="time"
                value={startTime}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  setStartTime(event.currentTarget.value);
                }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Längd</span>
              <Select
                value={String(durationMinutes)}
                onValueChange={(next: string) => {
                  setDurationMinutes(Number(next));
                }}
              >
                <SelectTrigger className="w-full">
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
              <span className="text-sm font-medium">Mekaniker</span>
              <Select value={assignedUserId} onValueChange={setAssignedUserId}>
                <SelectTrigger className="w-full">
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

          {date !== null && relevantBookings.length > 0 ? (
            <div className="flex flex-col gap-1 rounded-sharp border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">
                {assignedUserId === UNASSIGNED
                  ? 'Andra bokningar samma dag'
                  : 'Mekanikerns övriga bokningar samma dag'}
              </p>
              <ul className="flex flex-col gap-1 text-sm">
                {relevantBookings.map((booking: BookingWithRelations) => (
                  <li
                    key={booking.id}
                    className={
                      overlapping.some(
                        (item: BookingWithRelations) => item.id === booking.id,
                      )
                        ? 'text-status-oxide'
                        : 'text-muted-foreground'
                    }
                  >
                    <span className="tabular-nums">
                      {formatTime(booking.startsAt)}–
                      {formatTime(booking.endsAt)}
                    </span>{' '}
                    {booking.customer.name}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {overlapping.length > 0 ? (
            <p role="alert" className="text-sm text-destructive">
              Krockar med en befintlig bokning ovan. Bekräftelsen kan ändå nekas
              av servern om tiden inte längre är ledig.
            </p>
          ) : null}

          {conflictMessage !== null ? (
            <p role="alert" className="text-sm text-destructive">
              {conflictMessage}
            </p>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="confirm-booking-note"
              className="text-sm font-medium"
            >
              Anteckning
            </label>
            <Textarea
              id="confirm-booking-note"
              value={note}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                setNote(event.currentTarget.value);
              }}
              placeholder="Valfritt, synlig internt"
            />
          </div>
        </div>

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
            isPending={confirmRequest.isPending}
            onClick={() => {
              void handleConfirm();
            }}
          >
            Bekräfta bokning
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
