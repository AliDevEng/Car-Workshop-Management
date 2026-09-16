'use client';

import {
  CarFrontIcon,
  PlusIcon,
  ShieldIcon,
  UserRoundIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import {
  CUSTOMER_TYPE_LABELS,
  CUSTOMER_TYPES,
  customerTypeSchema,
  emailSchema,
  orgNumberSchema,
  phoneSchema,
  shortTextSchema,
} from 'shared';
import { useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { CreateVehicleDialog } from '@/components/admin/create-vehicle-dialog';
import { DetailLayout } from '@/components/admin/detail-layout';
import { InlineField } from '@/components/admin/inline-field';
import { notifyError, notifySuccess } from '@/components/admin/notify';
import { PageHeader } from '@/components/admin/page-header';
import { ReservedSection } from '@/components/admin/reserved-section';
import {
  DetailSkeleton,
  EmptyState,
  ErrorState,
} from '@/components/admin/states';
import { CustomerWorkOrderHistory } from '@/components/admin/work-order-history';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ApiError } from '@/lib/api';
import { queryKeys } from '@/lib/api/keys';
import {
  useCustomer,
  useSetCustomerActive,
  useUpdateCustomer,
} from '@/lib/api/customers';
import { formatDate } from '@/lib/format/date';
import { schemaValidator } from '@/lib/admin/validators';

const validatePhone = schemaValidator(phoneSchema);
const validateEmail = schemaValidator(emailSchema);
const validateOrgNumber = schemaValidator(orgNumberSchema);
const validateAddress = schemaValidator(shortTextSchema);

export function CustomerDetailPage({
  customerId,
}: {
  readonly customerId: string;
}) {
  const queryClient = useQueryClient();
  const customerQuery = useCustomer(customerId);
  const updateCustomer = useUpdateCustomer(customerId);
  const setActive = useSetCustomerActive(customerId);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  const error =
    customerQuery.error === null
      ? null
      : customerQuery.error instanceof ApiError
        ? customerQuery.error
        : ApiError.invalidResponse('Kunden kunde inte visas.');

  if (error !== null) {
    return (
      <ErrorState
        message={error.message}
        onRetry={() => {
          void customerQuery.refetch();
        }}
        {...(error.requestId === undefined
          ? {}
          : { requestId: error.requestId })}
      />
    );
  }

  if (customerQuery.isPending || customerQuery.data === undefined) {
    return <DetailSkeleton />;
  }

  const customer = customerQuery.data;

  // No local try/catch: the rejection reaches `InlineField`'s own `commit()`,
  // which is where the error is actually shown — right beside the field that
  // failed, in the backend's own Swedish message (`ApiError` extends `Error`).
  // A toast here as well would say the same thing twice.
  async function saveField(
    field: 'name' | 'phone' | 'email' | 'orgNumber' | 'address' | 'notes',
    value: string,
  ): Promise<void> {
    await updateCustomer.mutateAsync({
      [field]: value === '' ? undefined : value,
    });
  }

  async function changeType(rawValue: string): Promise<void> {
    const type = customerTypeSchema.parse(rawValue);
    try {
      await updateCustomer.mutateAsync({ type });
    } catch (caught) {
      notifyError(caught);
    }
  }

  async function toggleActive(): Promise<void> {
    try {
      const next = await setActive.mutateAsync(!customer.isActive);
      notifySuccess(
        next.isActive ? 'Kunden är återaktiverad.' : 'Kunden är inaktiverad.',
      );
      setConfirmDeactivate(false);
    } catch (caught) {
      notifyError(caught);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={<span>Admin / Kunder / {customer.name}</span>}
        title={customer.name}
        {...(customer.isActive
          ? {}
          : { description: 'Kunden är inaktiverad.' })}
        actions={
          <div className="flex items-center gap-2">
            {customer.isActive ? null : <Badge tone="neutral">Inaktiv</Badge>}
            {customer.isActive ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setConfirmDeactivate(true);
                  }}
                >
                  Inaktivera kund
                </Button>
                <ConfirmDialog
                  open={confirmDeactivate}
                  onOpenChange={setConfirmDeactivate}
                  title="Inaktivera kund"
                  description={`${customer.name} döljs från aktiva listor men behåller alla fordon och all historik. Kunden kan återaktiveras när som helst.`}
                  confirmLabel="Inaktivera kund"
                  onConfirm={() => {
                    void toggleActive();
                  }}
                  isPending={setActive.isPending}
                />
              </>
            ) : (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  void toggleActive();
                }}
                isPending={setActive.isPending}
              >
                Återaktivera kund
              </Button>
            )}
          </div>
        }
      />

      <DetailLayout
        main={
          <div className="flex flex-col gap-4">
            <Card className="rounded-soft">
              <CardHeader>
                <CardTitle>Kontaktuppgifter</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="customer-type"
                    className="text-sm font-medium"
                  >
                    Typ
                  </label>
                  <Select
                    value={customer.type}
                    onValueChange={(value) => {
                      void changeType(value);
                    }}
                  >
                    <SelectTrigger
                      id="customer-type"
                      className="w-full sm:w-56"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CUSTOMER_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {CUSTOMER_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <InlineField
                  label="Namn"
                  value={customer.name}
                  required
                  onSave={(value) => saveField('name', value)}
                />
                <InlineField
                  label="Telefon"
                  type="tel"
                  value={customer.phone}
                  required
                  validate={validatePhone}
                  onSave={(value) => saveField('phone', value)}
                />
                <InlineField
                  label="E-post"
                  type="email"
                  value={customer.email ?? ''}
                  validate={validateEmail}
                  onSave={(value) => saveField('email', value)}
                />
                {customer.type === 'COMPANY' ? (
                  <InlineField
                    label="Organisationsnummer"
                    value={customer.orgNumber ?? ''}
                    validate={validateOrgNumber}
                    onSave={(value) => saveField('orgNumber', value)}
                  />
                ) : null}
                <InlineField
                  label="Adress"
                  value={customer.address ?? ''}
                  validate={validateAddress}
                  onSave={(value) => saveField('address', value)}
                />
              </CardContent>
            </Card>

            <Card className="rounded-soft">
              <CardHeader>
                <CardTitle>Fordon</CardTitle>
                <CardAction>
                  <CreateVehicleDialog
                    customerId={customerId}
                    onCreated={() => {
                      void queryClient.invalidateQueries({
                        queryKey: queryKeys.customer(customerId),
                      });
                    }}
                    trigger={
                      <Button type="button" variant="secondary" size="sm">
                        <PlusIcon aria-hidden="true" />
                        Lägg till fordon
                      </Button>
                    }
                  />
                </CardAction>
              </CardHeader>
              <CardContent>
                {customer.vehicles.length === 0 ? (
                  <EmptyState
                    icon={CarFrontIcon}
                    message="Kunden äger inga fordon än."
                  />
                ) : (
                  <ul className="flex flex-col gap-2">
                    {customer.vehicles.map((vehicle) => (
                      <li key={vehicle.id}>
                        <Link
                          href={`/admin/fordon/${vehicle.id}`}
                          className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-sharp border border-border px-3 py-2 hover:bg-accent focus-visible:bg-accent"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium tabular-nums">
                              {vehicle.registrationNumberDisplay}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {vehicle.make} {vehicle.model}
                            </span>
                          </span>
                          <CarFrontIcon
                            aria-hidden="true"
                            className="size-4 text-muted-foreground"
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-soft">
              <CardHeader>
                <CardTitle>Arbetsorderhistorik</CardTitle>
              </CardHeader>
              <CardContent>
                <CustomerWorkOrderHistory customerId={customerId} />
              </CardContent>
            </Card>
          </div>
        }
        aside={
          <div className="flex flex-col gap-4">
            <Card className="rounded-soft">
              <CardHeader>
                <CardTitle>Anteckningar</CardTitle>
              </CardHeader>
              <CardContent>
                <InlineField
                  label="Interna anteckningar"
                  multiline
                  value={customer.notes ?? ''}
                  onSave={(value) => saveField('notes', value)}
                />
              </CardContent>
            </Card>

            <ReservedSection
              icon={ShieldIcon}
              title="Sekretess (GDPR)"
              message="Export och anonymisering av kunduppgifter aktiveras för administratörer i F12.7, sedan de har verifierats mot en riktig radering."
            />

            <Card className="rounded-soft" size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xs text-muted-foreground">
                  <UserRoundIcon aria-hidden="true" className="size-4" />
                  Kund sedan
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {formatDate(customer.createdAt)}
              </CardContent>
            </Card>
          </div>
        }
      />
    </div>
  );
}
