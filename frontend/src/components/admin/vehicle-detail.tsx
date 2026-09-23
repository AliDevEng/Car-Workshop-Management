'use client';

import {
  ExternalLinkIcon,
  Link2Icon,
  RefreshCwIcon,
  UserRoundIcon,
  WrenchIcon,
} from 'lucide-react';
import Link from 'next/link';
import {
  buildPartnerUrl,
  nameSchema,
  type OdometerReading,
  type PartnerLink,
} from 'shared';
import { DetailLayout } from '@/components/admin/detail-layout';
import { FieldGrid, FieldGridFull } from '@/components/admin/field-grid';
import { InlineField } from '@/components/admin/inline-field';
import { notifyError, notifySuccess } from '@/components/admin/notify';
import { OdometerSparkline } from '@/components/admin/odometer-sparkline';
import { PageHeader } from '@/components/admin/page-header';
import { ReassignOwnerDialog } from '@/components/admin/reassign-owner-dialog';
import { RecordOdometerReadingDialog } from '@/components/admin/record-odometer-reading-dialog';
import { ReservedSection } from '@/components/admin/reserved-section';
import { inspectionStatus } from '@/components/admin/status';
import { VehicleWorkOrderHistory } from '@/components/admin/work-order-history';
import { StatusBadge } from '@/components/admin/status-badge';
import {
  DetailSkeleton,
  EmptyState,
  ErrorState,
} from '@/components/admin/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError } from '@/lib/api';
import {
  schemaValidator,
  validateModelYear,
  validateVin,
} from '@/lib/admin/validators';
import { useCurrentUser } from '@/lib/api/current-user';
import { usePartnerLinks } from '@/lib/api/partner-links';
import { useRefreshVehicleData } from '@/lib/api/vehicle-data';
import {
  useOdometerReadings,
  useUpdateVehicle,
  useVehicle,
} from '@/lib/api/vehicles';
import { formatDate, formatRelative } from '@/lib/format/date';
import { formatOdometer } from '@/lib/format/odometer';

const validateName = schemaValidator(nameSchema);

type EditableTextField = 'variant' | 'engineCode' | 'fuelType';
type EditableDateField =
  'firstRegistrationDate' | 'lastInspectionDate' | 'nextInspectionDueDate';

export function VehicleDetailPage({
  vehicleId,
}: {
  readonly vehicleId: string;
}) {
  const vehicleQuery = useVehicle(vehicleId);
  const updateVehicle = useUpdateVehicle(vehicleId);
  const odometerQuery = useOdometerReadings(vehicleId);
  const currentUserQuery = useCurrentUser();
  const isAdmin = currentUserQuery.data?.role === 'ADMIN';
  const refreshVehicleData = useRefreshVehicleData(vehicleId);
  const partnerLinksQuery = usePartnerLinks({ isActive: true });

  const error =
    vehicleQuery.error === null
      ? null
      : vehicleQuery.error instanceof ApiError
        ? vehicleQuery.error
        : ApiError.invalidResponse('Fordonet kunde inte visas.');

  if (error !== null) {
    return (
      <ErrorState
        message={error.message}
        onRetry={() => {
          void vehicleQuery.refetch();
        }}
        {...(error.requestId === undefined
          ? {}
          : { requestId: error.requestId })}
      />
    );
  }

  if (vehicleQuery.isPending || vehicleQuery.data === undefined) {
    return <DetailSkeleton />;
  }

  const vehicle = vehicleQuery.data;

  /**
   * `null`, not `undefined`, for a cleared field. `undefined` is dropped by
   * `JSON.stringify`, so clearing a VIN used to PATCH `{}` — a successful
   * no-op that still reported "Sparat" (UI_UX_AUDIT D1). `shared`'s update
   * contract now separates the two: `undefined` leaves the field alone,
   * `null` clears it.
   */
  async function saveText(
    field: EditableTextField,
    value: string,
  ): Promise<void> {
    await updateVehicle.mutateAsync({ [field]: value === '' ? null : value });
  }

  /** `make` and `model` are `NOT NULL` (§4.2, B3) and cannot be cleared. */
  async function saveRequiredText(
    field: 'make' | 'model',
    value: string,
  ): Promise<void> {
    await updateVehicle.mutateAsync({ [field]: value });
  }

  async function saveDate(
    field: EditableDateField,
    value: string,
  ): Promise<void> {
    await updateVehicle.mutateAsync({ [field]: value === '' ? null : value });
  }

  async function saveModelYear(value: string): Promise<void> {
    await updateVehicle.mutateAsync({
      modelYear: value === '' ? null : Number(value),
    });
  }

  async function saveVin(value: string): Promise<void> {
    await updateVehicle.mutateAsync({ vin: value === '' ? null : value });
  }

  async function handleRefreshVehicleData(): Promise<void> {
    try {
      const updated = await refreshVehicleData.mutateAsync();
      notifySuccess(
        `Biluppgifter uppdaterade för ${updated.registrationNumberDisplay}.`,
      );
    } catch (error) {
      notifyError(error);
    }
  }

  const readingsOldestFirst = [...(odometerQuery.data?.data ?? [])]
    .sort((a: OdometerReading, b: OdometerReading) =>
      a.readAt.localeCompare(b.readAt),
    )
    .map((reading: OdometerReading) => reading.km);

  const regNrPartnerLinks = (partnerLinksQuery.data?.data ?? []).filter(
    (link: PartnerLink) => link.placeholderType === 'REGNR',
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'Fordon', href: '/admin/fordon' },
          { label: vehicle.registrationNumberDisplay },
        ]}
        title={vehicle.registrationNumberDisplay}
        description={`${vehicle.make} ${vehicle.model}${
          vehicle.modelYear === null ? '' : ` · ${String(vehicle.modelYear)}`
        } · Ägare: ${vehicle.customer === null ? 'Ingen kopplad' : vehicle.customer.name}`}
        actions={
          <ReassignOwnerDialog
            vehicleId={vehicleId}
            currentOwnerName={vehicle.customer?.name ?? null}
          />
        }
      />

      <DetailLayout
        main={
          <div className="flex flex-col gap-4">
            <Card className="rounded-soft">
              <CardHeader>
                <CardTitle>Teknisk data</CardTitle>
              </CardHeader>
              <CardContent>
                <FieldGrid>
                  <InlineField
                    label="Märke"
                    required
                    undoable
                    validate={validateName}
                    value={vehicle.make}
                    onSave={(value: string) => saveRequiredText('make', value)}
                  />
                  <InlineField
                    label="Modell"
                    required
                    undoable
                    validate={validateName}
                    value={vehicle.model}
                    onSave={(value: string) => saveRequiredText('model', value)}
                  />
                  <InlineField
                    label="Variant"
                    undoable
                    value={vehicle.variant ?? ''}
                    onSave={(value: string) => saveText('variant', value)}
                    placeholder="T.ex. R-Design"
                  />
                  <InlineField
                    label="Modellår"
                    type="number"
                    undoable
                    validate={validateModelYear}
                    value={
                      vehicle.modelYear === null
                        ? ''
                        : String(vehicle.modelYear)
                    }
                    onSave={saveModelYear}
                  />
                  <FieldGridFull>
                    <InlineField
                      label="Chassinummer (VIN)"
                      undoable
                      validate={validateVin}
                      value={vehicle.vin ?? ''}
                      onSave={saveVin}
                    />
                  </FieldGridFull>
                  <InlineField
                    label="Motorkod"
                    undoable
                    value={vehicle.engineCode ?? ''}
                    onSave={(value: string) => saveText('engineCode', value)}
                  />
                  <InlineField
                    label="Bränsle"
                    undoable
                    value={vehicle.fuelType ?? ''}
                    onSave={(value: string) => saveText('fuelType', value)}
                  />
                  <InlineField
                    label="Första registrering"
                    type="date"
                    value={vehicle.firstRegistrationDate ?? ''}
                    onSave={(value: string) =>
                      saveDate('firstRegistrationDate', value)
                    }
                  />
                </FieldGrid>

                <div className="mt-4 flex flex-col gap-2 rounded-sharp border border-dashed border-border p-3">
                  <p className="text-sm font-medium">
                    Biluppgifter från fordonsregistret
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {vehicle.dataFetchedAt === null
                      ? 'Aldrig hämtat.'
                      : `Senast hämtat ${formatRelative(vehicle.dataFetchedAt)} (${formatDate(vehicle.dataFetchedAt)}).`}
                  </p>
                  {isAdmin ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="self-start"
                      isPending={refreshVehicleData.isPending}
                      onClick={() => {
                        void handleRefreshVehicleData();
                      }}
                    >
                      <RefreshCwIcon aria-hidden="true" />
                      Uppdatera från fordonsregistret
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Endast administratörer kan hämta nya uppgifter.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-soft">
              <CardHeader>
                <CardTitle>Besiktning</CardTitle>
              </CardHeader>
              <CardContent>
                <FieldGrid>
                  <InlineField
                    label="Senast besiktigad"
                    type="date"
                    value={vehicle.lastInspectionDate ?? ''}
                    onSave={(value: string) =>
                      saveDate('lastInspectionDate', value)
                    }
                  />
                  <InlineField
                    label="Nästa besiktning senast"
                    type="date"
                    value={vehicle.nextInspectionDueDate ?? ''}
                    onSave={(value: string) =>
                      saveDate('nextInspectionDueDate', value)
                    }
                  />
                  {vehicle.nextInspectionDueDate === null ? null : (
                    <FieldGridFull className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        Status
                      </span>
                      <StatusBadge
                        status={inspectionStatus(vehicle.nextInspectionDueDate)}
                      />
                    </FieldGridFull>
                  )}
                </FieldGrid>
              </CardContent>
            </Card>

            {/* Wired up in F11.6, on top of B9. The milestone ids stay in
                this comment rather than in the Swedish copy a user reads. */}
            <ReservedSection
              icon={WrenchIcon}
              title="Servicerekommendationer"
              message="Servicerekommendationer är under arbete. Förslagen och möjligheten att acceptera eller avfärda dem visas här när funktionen är klar."
            />

            <Card className="rounded-soft">
              <CardHeader>
                <CardTitle>Partnerlänkar</CardTitle>
              </CardHeader>
              <CardContent>
                {regNrPartnerLinks.length === 0 ? (
                  <EmptyState
                    inline
                    icon={Link2Icon}
                    message="Inga partnerlänkar är konfigurerade än."
                  />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {regNrPartnerLinks.map((link: PartnerLink) => (
                      <Button
                        key={link.id}
                        asChild
                        variant="secondary"
                        size="sm"
                      >
                        <a
                          href={buildPartnerUrl(
                            link,
                            vehicle.registrationNumber,
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {link.name}
                          <ExternalLinkIcon aria-hidden="true" />
                        </a>
                      </Button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-soft">
              <CardHeader>
                <CardTitle>Arbetsorderhistorik</CardTitle>
              </CardHeader>
              <CardContent>
                <VehicleWorkOrderHistory vehicleId={vehicleId} />
              </CardContent>
            </Card>
          </div>
        }
        aside={
          <div className="flex flex-col gap-4">
            <Card className="rounded-soft">
              <CardHeader>
                <CardTitle>Ägare</CardTitle>
              </CardHeader>
              <CardContent>
                {vehicle.customer === null ? (
                  <EmptyState
                    inline
                    message="Ingen kund kopplad till fordonet."
                    icon={UserRoundIcon}
                  />
                ) : (
                  <Link
                    href={`/admin/kunder/${vehicle.customer.id}`}
                    className="block rounded-sharp border border-border px-3 py-2 hover:bg-accent focus-visible:bg-accent"
                  >
                    <span className="block truncate font-medium">
                      {vehicle.customer.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {vehicle.customer.phone}
                    </span>
                  </Link>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-soft">
              <CardHeader>
                <CardTitle>Mätarställning</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-2xl font-semibold tabular-nums">
                  {vehicle.lastKnownOdometerKm === null
                    ? 'Ingen avläsning'
                    : formatOdometer(vehicle.lastKnownOdometerKm)}
                </p>
                <OdometerSparkline readingsOldestFirst={readingsOldestFirst} />
                <RecordOdometerReadingDialog
                  vehicleId={vehicleId}
                  currentKm={vehicle.lastKnownOdometerKm}
                />
                {(odometerQuery.data?.data.length ?? 0) === 0 ? null : (
                  <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                    {odometerQuery.data?.data
                      .slice(0, 5)
                      .map((reading: OdometerReading) => (
                        <li
                          key={reading.id}
                          className="flex justify-between gap-2"
                        >
                          <span className="tabular-nums">
                            {formatDate(reading.readAt)}
                          </span>
                          <span className="tabular-nums">
                            {formatOdometer(reading.km)}
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-soft" size="sm">
              <CardHeader>
                <CardTitle className="text-xs text-muted-foreground">
                  Registrerad i systemet
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {formatDate(vehicle.createdAt)}
              </CardContent>
            </Card>
          </div>
        }
      />
    </div>
  );
}
