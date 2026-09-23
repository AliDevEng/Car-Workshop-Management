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
import { FieldGrid, FieldGridFull } from '@/components/admin/field-grid';
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

  /**
   * No local try/catch: the rejection reaches `InlineField`'s own `commit()`,
   * which is where the error is actually shown — right beside the field that
   * failed, in the backend's own Swedish message (`ApiError` extends
   * `Error`). A toast here as well would say the same thing twice.
   *
   * `null`, not `undefined`, for a cleared field: `undefined` is dropped by
   * `JSON.stringify`, so clearing an address used to PATCH `{}` — a request
   * that succeeded, reported "Sparat", and left the old value in the
   * database (UI_UX_AUDIT D1). `shared`'s update contract now distinguishes
   * the two: `undefined` leaves a field alone, `null` clears it.
   */
  async function saveField(
    field: 'name' | 'phone' | 'email' | 'orgNumber' | 'address' | 'notes',
    value: string,
  ): Promise<void> {
    await updateCustomer.mutateAsync({ [field]: value === '' ? null : value });
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
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'Kunder', href: '/admin/kunder' },
          { label: customer.name },
        ]}
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
                  variant="outline"
                  className="text-destructive hover:text-destructive"
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
              <CardContent>
                <FieldGrid>
                  <div className="flex min-w-0 flex-col gap-1.5">
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
                      <SelectTrigger id="customer-type" className="w-full">
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

                  {customer.type === 'COMPANY' ? (
                    <InlineField
                      label="Organisationsnummer"
                      undoable
                      value={customer.orgNumber ?? ''}
                      validate={validateOrgNumber}
                      onSave={(value) => saveField('orgNumber', value)}
                    />
                  ) : null}

                  <FieldGridFull>
                    <InlineField
                      label="Namn"
                      value={customer.name}
                      required
                      undoable
                      onSave={(value) => saveField('name', value)}
                    />
                  </FieldGridFull>
                  <InlineField
                    label="Telefon"
                    type="tel"
                    value={customer.phone}
                    required
                    undoable
                    validate={validatePhone}
                    onSave={(value) => saveField('phone', value)}
                  />
                  <InlineField
                    label="E-post"
                    type="email"
                    undoable
                    value={customer.email ?? ''}
                    validate={validateEmail}
                    onSave={(value) => saveField('email', value)}
                  />
                  <FieldGridFull>
                    <InlineField
                      label="Adress"
                      undoable
                      value={customer.address ?? ''}
                      validate={validateAddress}
                      onSave={(value) => saveField('address', value)}
                    />
                  </FieldGridFull>
                </FieldGrid>
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
                    inline
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

            {/* Activated in F12.7, once verified against a real erasure.
                The milestone id stays in this comment: it is traceability
                for the team, not copy for a customer-facing screen. */}
            <ReservedSection
              icon={ShieldIcon}
              title="Sekretess (GDPR)"
              message="Export och anonymisering av kunduppgifter är under arbete och öppnas här för administratörer när funktionen är verifierad."
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
