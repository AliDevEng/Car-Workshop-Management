'use client';

import { SearchIcon, UserRoundIcon, XIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CustomerListItem } from 'shared';
import { notifyError, notifySuccess } from '@/components/admin/notify';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useCustomers } from '@/lib/api/customers';
import { useUpdateVehicle } from '@/lib/api/vehicles';

const SEARCH_DEBOUNCE_MS = 250;

/**
 * F6.5.3 — reassigning a vehicle's owner, with the warning that its
 * odometer history and everything else hanging off the vehicle stays put
 * (§6.3: a vehicle's owner can change without losing its service history,
 * because history hangs off the vehicle, not the customer).
 */
export function ReassignOwnerDialog({
  vehicleId,
  currentOwnerName,
}: {
  readonly vehicleId: string;
  readonly currentOwnerName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const updateVehicle = useUpdateVehicle(vehicleId);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(queryInput.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [queryInput]);

  // Gated on `query`: an empty search box shows nothing to pick from rather
  // than an arbitrary page of customers nobody asked for.
  const customersQuery = useCustomers(
    { q: query, limit: 10 },
    { enabled: query !== '' },
  );

  async function assign(customer: CustomerListItem | null): Promise<void> {
    try {
      await updateVehicle.mutateAsync({ customerId: customer?.id ?? null });
      notifySuccess(
        customer === null
          ? 'Ägaren är borttagen. Fordonets historik ligger kvar.'
          : `${customer.name} är nu ägare. Fordonets historik ligger kvar.`,
      );
      setOpen(false);
      setQueryInput('');
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
          setQueryInput('');
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" size="sm">
          {currentOwnerName === null ? 'Koppla ägare' : 'Byt ägare'}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {currentOwnerName === null ? 'Koppla ägare' : 'Byt ägare'}
          </DialogTitle>
          <DialogDescription>
            Mätarställning, servicehistorik och allt annat kopplat till
            fordonet ligger kvar oavsett vem som äger det.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="relative">
            <SearchIcon
              aria-hidden="true"
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              autoFocus
              value={queryInput}
              onChange={(event) => {
                setQueryInput(event.currentTarget.value);
              }}
              placeholder="Sök kund på namn eller telefon"
              className="pl-9"
            />
          </div>

          {currentOwnerName !== null ? (
            <Button
              type="button"
              variant="ghost"
              className="justify-start"
              onClick={() => {
                void assign(null);
              }}
              isPending={updateVehicle.isPending}
            >
              <XIcon aria-hidden="true" />
              Ta bort ägare ({currentOwnerName})
            </Button>
          ) : null}

          <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {customersQuery.data?.data.map((customer) => (
              <button
                key={customer.id}
                type="button"
                disabled={updateVehicle.isPending}
                onClick={() => {
                  void assign(customer);
                }}
                className="grid min-h-11 grid-cols-[20px_minmax(0,1fr)] items-center gap-3 rounded-sharp px-2 py-2 text-left hover:bg-accent focus-visible:bg-accent disabled:pointer-events-none disabled:opacity-50"
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
            {query !== '' && (customersQuery.data?.data.length ?? 0) === 0 ? (
              <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                Ingen kund matchar sökningen.
              </p>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
