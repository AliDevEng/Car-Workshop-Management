'use client';

import { useState } from 'react';
import {
  stockholmDate,
  stockholmWallClock,
  stockholmWallClockToUtc,
  type BookingStatus,
  type BookingWithRelations,
  type UserSummary,
} from 'shared';
import { isConflictError } from '@/components/admin/conflict';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { CreateWorkOrderDialog } from '@/components/admin/create-work-order-dialog';
import { notifyError, notifySuccess } from '@/components/admin/notify';
import { bookingStatus } from '@/components/admin/status';
import { StatusBadge } from '@/components/admin/status-badge';
import { DatePicker } from '@/components/form/date-picker';
import { TimePicker } from '@/components/form/time-picker';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BOOKING_DURATION_OPTIONS_MINUTES,
  addMinutesToLocalDateTime,
  formatDurationMinutes,
  isPastLocalDateTime,
  type BookingDurationMinutes,
} from '@/lib/admin/calendar';
import { useUpdateBooking } from '@/lib/api/bookings';
import { useUserRoster } from '@/lib/api/users';
import { formatDate } from '@/lib/format/date';

const UNASSIGNED = 'UNASSIGNED' as const;

function closestDurationOption(minutes: number): BookingDurationMinutes {
  return BOOKING_DURATION_OPTIONS_MINUTES.reduce(
    (closest: BookingDurationMinutes, option: BookingDurationMinutes) =>
      Math.abs(option - minutes) < Math.abs(closest - minutes)
        ? option
        : closest,
  );
}

/**
 * F8.3.3/F8.4.2 — a booking opened from the calendar grid. This is the
 * keyboard-and-screen-reader path to everything the drag gesture also does
 * (F8.6.4): date, time, duration and mechanic can all be changed here
 * without ever touching a pointer.
 */
export function BookingDetailDialog({
  booking,
  open,
  onOpenChange,
}: {
  readonly booking: BookingWithRelations;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const startInstant = new Date(booking.startsAt);
  const endInstant = new Date(booking.endsAt);
  const initialMinutes = Math.round(
    (endInstant.getTime() - startInstant.getTime()) / 60_000,
  );

  const [date, setDate] = useState(stockholmDate(startInstant));
  const [startTime, setStartTime] = useState(
    stockholmWallClock(startInstant).slice(11),
  );
  const [durationMinutes, setDurationMinutes] = useState<number>(
    closestDurationOption(initialMinutes),
  );
  const [assignedUserId, setAssignedUserId] = useState(
    booking.assignedUserId ?? UNASSIGNED,
  );
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const rosterQuery = useUserRoster();
  const updateBooking = useUpdateBooking();

  const localStart = `${date}T${startTime}`;
  const localEnd = addMinutesToLocalDateTime(localStart, durationMinutes);
  const isPast = isPastLocalDateTime(localStart);
  const editable = booking.status === 'SCHEDULED';

  const hasChanges =
    date !== stockholmDate(startInstant) ||
    startTime !== stockholmWallClock(startInstant).slice(11) ||
    durationMinutes !== initialMinutes ||
    assignedUserId !== (booking.assignedUserId ?? UNASSIGNED);

  async function applyUpdate(
    input: Parameters<typeof updateBooking.mutateAsync>[0]['input'],
    successMessage: string,
  ): Promise<void> {
    setConflictMessage(null);
    try {
      await updateBooking.mutateAsync({ id: booking.id, input });
      notifySuccess(successMessage);
      onOpenChange(false);
    } catch (error) {
      // The `409` from the exclusion constraint already carries a specific,
      // Swedish explanation — shown inline rather than replaced (F8.2.4).
      if (isConflictError(error)) {
        setConflictMessage(error.message);
        return;
      }
      notifyError(error);
    }
  }

  async function handleSave(): Promise<void> {
    if (isPast) {
      return;
    }
    await applyUpdate(
      {
        startsAt: stockholmWallClockToUtc(localStart).toISOString(),
        endsAt: stockholmWallClockToUtc(localEnd).toISOString(),
        assignedUserId: assignedUserId === UNASSIGNED ? null : assignedUserId,
      },
      'Bokningen är uppdaterad.',
    );
  }

  async function handleStatusChange(status: BookingStatus): Promise<void> {
    await applyUpdate(
      { status },
      status === 'NO_SHOW'
        ? 'Bokningen är markerad som uteblev.'
        : 'Bokningen är avbokad.',
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {booking.customer.name}
            <StatusBadge status={bookingStatus(booking.status)} />
          </DialogTitle>
          <DialogDescription>
            {booking.vehicle === null
              ? 'Inget fordon kopplat'
              : `${booking.vehicle.registrationNumberDisplay} · ${booking.vehicle.make} ${booking.vehicle.model}`}
          </DialogDescription>
        </DialogHeader>

        {editable ? (
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="booking-detail-date"
                  className="text-sm font-medium"
                >
                  Datum
                </label>
                <DatePicker
                  id="booking-detail-date"
                  value={date}
                  onChange={(value) => {
                    if (value !== null) {
                      setDate(value);
                    }
                  }}
                  disablePast
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="booking-detail-time"
                  className="text-sm font-medium"
                >
                  Starttid
                </label>
                <TimePicker
                  id="booking-detail-time"
                  label="Starttid"
                  value={startTime}
                  onChange={setStartTime}
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
                <Select
                  value={assignedUserId}
                  onValueChange={setAssignedUserId}
                >
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
            {conflictMessage !== null ? (
              <p role="alert" className="text-sm text-destructive">
                {conflictMessage}
              </p>
            ) : null}

            {booking.vehicle === null ? (
              <div className="flex flex-col items-start gap-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled
                  className="self-start"
                >
                  Starta arbete
                </Button>
                <p className="text-xs text-muted-foreground">
                  Bokningen saknar ett kopplat fordon. En arbetsorder kräver ett
                  fordon.
                </p>
              </div>
            ) : (
              <CreateWorkOrderDialog
                mode={{ kind: 'fromBooking', booking }}
                trigger={
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="self-start"
                  >
                    Starta arbete
                  </Button>
                }
              />
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Bokad {formatDate(booking.startsAt)}. Endast en inbokad tid kan
            ändras eller avbokas här.
          </p>
        )}

        <DialogFooter className="justify-between sm:justify-between">
          {editable ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                isPending={updateBooking.isPending}
                onClick={() => {
                  void handleStatusChange('NO_SHOW');
                }}
              >
                Markera som uteblev
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => {
                  setConfirmingCancel(true);
                }}
              >
                Avboka
              </Button>
              <ConfirmDialog
                open={confirmingCancel}
                onOpenChange={setConfirmingCancel}
                title="Avboka tiden"
                description={`${booking.customer.name}s bokning avbokas och slotten blir ledig igen. Detta går inte att ångra.`}
                confirmLabel="Avboka bokning"
                isPending={updateBooking.isPending}
                onConfirm={() => {
                  void handleStatusChange('CANCELLED');
                }}
              />
            </div>
          ) : (
            <span />
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Stäng
            </Button>
            {editable ? (
              <Button
                type="button"
                disabled={isPast || !hasChanges}
                isPending={updateBooking.isPending}
                onClick={() => {
                  void handleSave();
                }}
              >
                Spara ändringar
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
