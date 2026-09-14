'use client';

import {
  ClipboardListIcon,
  Link2Icon,
  SearchIcon,
  UserRoundIcon,
  WrenchIcon,
} from 'lucide-react';
import Link from 'next/link';
import { nameSchema } from 'shared';
import { DetailLayout } from '@/components/admin/detail-layout';
import { InlineField } from '@/components/admin/inline-field';
import { OdometerSparkline } from '@/components/admin/odometer-sparkline';
import { PageHeader } from '@/components/admin/page-header';
import { ReassignOwnerDialog } from '@/components/admin/reassign-owner-dialog';
import { RecordOdometerReadingDialog } from '@/components/admin/record-odometer-reading-dialog';
import { ReservedSection } from '@/components/admin/reserved-section';
import { inspectionStatus } from '@/components/admin/status';
import { StatusBadge } from '@/components/admin/status-badge';
import { DetailSkeleton, EmptyState, ErrorState } from '@/components/admin/states';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError } from '@/lib/api';
import { schemaValidator, validateModelYear, validateVin } from '@/lib/admin/validators';
import { useOdometerReadings, useUpdateVehicle, useVehicle } from '@/lib/api/vehicles';
import { formatDate } from '@/lib/format/date';
import { formatOdometer } from '@/lib/format/odometer';

const validateName = schemaValidator(nameSchema);

type EditableTextField =
  | 'make'
  | 'model'
  | 'variant'
  | 'engineCode'
  | 'fuelType';
type EditableDateField =
  | 'firstRegistrationDate'
  | 'lastInspectionDate'
  | 'nextInspectionDueDate';

export function VehicleDetailPage({
  vehicleId,
}: {
  readonly vehicleId: string;
}) {
  const vehicleQuery = useVehicle(vehicleId);
  const updateVehicle = useUpdateVehicle(vehicleId);
  const odometerQuery = useOdometerReadings(vehicleId);

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
        {...(error.requestId === undefined ? {} : { requestId: error.requestId })}
      />
    );
  }

  if (vehicleQuery.isPending || vehicleQuery.data === undefined) {
    return <DetailSkeleton />;
  }

  const vehicle = vehicleQuery.data;

  async function saveText(field: EditableTextField, value: string): Promise<void> {
    await updateVehicle.mutateAsync({ [field]: value === '' ? undefined : value });
  }

  async function saveDate(field: EditableDateField, value: string): Promise<void> {
    await updateVehicle.mutateAsync({ [field]: value === '' ? undefined : value });
  }

  async function saveModelYear(value: string): Promise<void> {
    await updateVehicle.mutateAsync({
      modelYear: value === '' ? undefined : Number(value),
    });
  }

  async function saveVin(value: string): Promise<void> {
    await updateVehicle.mutateAsync({ vin: value === '' ? undefined : value });
  }

  const readingsOldestFirst = [...(odometerQuery.data?.data ?? [])]
    .sort((a, b) => a.readAt.localeCompare(b.readAt))
    .map((reading) => reading.km);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={<span>Admin / Fordon / {vehicle.registrationNumberDisplay}</span>}
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
              <CardContent className="flex flex-col gap-4">
                <InlineField
                  label="Märke"
                  required
                  validate={validateName}
                  value={vehicle.make}
                  onSave={(value) => saveText('make', value)}
                />
                <InlineField
                  label="Modell"
                  required
                  validate={validateName}
                  value={vehicle.model}
                  onSave={(value) => saveText('model', value)}
                />
                <InlineField
                  label="Variant"
                  value={vehicle.variant ?? ''}
                  onSave={(value) => saveText('variant', value)}
                  placeholder="T.ex. R-Design"
                />
                <InlineField
                  label="Modellår"
                  type="number"
                  validate={validateModelYear}
                  value={vehicle.modelYear === null ? '' : String(vehicle.modelYear)}
                  onSave={saveModelYear}
                />
                <InlineField
                  label="Chassinummer (VIN)"
                  validate={validateVin}
                  value={vehicle.vin ?? ''}
                  onSave={saveVin}
                />
                <InlineField
                  label="Motorkod"
                  value={vehicle.engineCode ?? ''}
                  onSave={(value) => saveText('engineCode', value)}
                />
                <InlineField
                  label="Bränsle"
                  value={vehicle.fuelType ?? ''}
                  onSave={(value) => saveText('fuelType', value)}
                />
                <InlineField
                  label="Första registrering"
                  type="date"
                  value={vehicle.firstRegistrationDate ?? ''}
                  onSave={(value) => saveDate('firstRegistrationDate', value)}
                />

                <ReservedSection
                  icon={SearchIcon}
                  title="Biluppgifter från extern källa"
                  message="Slagning mot fordonsregistret, cacheålder och källa kopplas in i F8.7 när B10.1–B10.4 finns. Ingen automatisk sökning sker."
                />
              </CardContent>
            </Card>

            <Card className="rounded-soft">
              <CardHeader>
                <CardTitle>Besiktning</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <InlineField
                  label="Senast besiktigad"
                  type="date"
                  value={vehicle.lastInspectionDate ?? ''}
                  onSave={(value) => saveDate('lastInspectionDate', value)}
                />
                <InlineField
                  label="Nästa besiktning senast"
                  type="date"
                  value={vehicle.nextInspectionDueDate ?? ''}
                  onSave={(value) => saveDate('nextInspectionDueDate', value)}
                />
                {vehicle.nextInspectionDueDate === null ? null : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <StatusBadge
                      status={inspectionStatus(vehicle.nextInspectionDueDate)}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <ReservedSection
              icon={WrenchIcon}
              title="Servicerekommendationer"
              message="Regelmotorns förslag, allvarlighetsgrad och möjligheten att acceptera eller avfärda dem kopplas in i F11.6, sedan B9 finns."
            />

            <ReservedSection
              icon={Link2Icon}
              title="Partnerlänkar"
              message="Snabblänkar till reservdelspartners kopplas in i F8.7, sedan B10.6 finns."
            />

            <ReservedSection
              icon={ClipboardListIcon}
              title="Arbetsorderhistorik"
              message="Fordonets arbetsorderhistorik kopplas in i F9.7, tillsammans med resten av arbetsordermodulen."
            />
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
                    {odometerQuery.data?.data.slice(0, 5).map((reading) => (
                      <li key={reading.id} className="flex justify-between gap-2">
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
