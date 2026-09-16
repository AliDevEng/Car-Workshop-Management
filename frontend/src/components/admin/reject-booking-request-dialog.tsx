'use client';

import { useState, type ChangeEvent } from 'react';
import type { BookingRequest } from 'shared';
import { notifyError, notifySuccess } from '@/components/admin/notify';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useRejectBookingRequest } from '@/lib/api/bookings';

/** F8.1.4 — rejecting a request always names a reason (§9.7's naming rule
 * applies just as much to a refusal as to a confirmation). */
export function RejectBookingRequestDialog({
  request,
  open,
  onOpenChange,
}: {
  readonly request: BookingRequest;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState('');
  const rejectRequest = useRejectBookingRequest();

  async function handleReject(): Promise<void> {
    if (reason.trim() === '') {
      return;
    }
    try {
      await rejectRequest.mutateAsync({
        id: request.id,
        input: { reason: reason.trim() },
      });
      notifySuccess('Förfrågan är avvisad.');
      onOpenChange(false);
      setReason('');
    } catch (error) {
      notifyError(error);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        onOpenChange(next);
        if (!next) {
          setReason('');
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Avvisa förfrågan</DialogTitle>
          <DialogDescription>
            Från {request.customerName}. Anledningen sparas men skickas inte
            till kunden automatiskt — det finns ingen e-postfunktion i
            systemet.
          </DialogDescription>
        </DialogHeader>

        <label htmlFor="reject-reason" className="text-sm font-medium">
          Anledning
        </label>
        <Textarea
          id="reject-reason"
          autoFocus
          value={reason}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
            setReason(event.currentTarget.value);
          }}
          placeholder="T.ex. Ingen ledig tid inom önskad period"
        />

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
            variant="destructive"
            disabled={reason.trim() === ''}
            isPending={rejectRequest.isPending}
            onClick={() => {
              void handleReject();
            }}
          >
            Avvisa förfrågan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
