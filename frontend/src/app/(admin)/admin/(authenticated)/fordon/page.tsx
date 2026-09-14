import { CarFrontIcon } from 'lucide-react';
import {
  dashboardSchema,
  paginatedResponseSchema,
  vehicleSchema,
  type InspectionDueVehicle,
  type Vehicle,
} from 'shared';
import { PageHeader } from '@/components/admin/page-header';
import {
  ReadOnlyTable,
  type ReadOnlyColumn,
} from '@/components/admin/read-only-table';
import { EmptyState } from '@/components/admin/states';
import { Badge } from '@/components/ui/badge';
import { apiFetchServer } from '@/lib/api/server';
import {
  firstSearchParam,
  type AdminSearchParams,
} from '@/lib/admin/search-params';
import { formatDateOnly } from '@/lib/format/date';

const vehicleListResponseSchema = paginatedResponseSchema(vehicleSchema);

const inspectionColumns: readonly ReadOnlyColumn<InspectionDueVehicle>[] = [
  {
    header: 'Fordon',
    cell: (vehicle: InspectionDueVehicle) => (
      <span id={`vehicle-${vehicle.id}`} className="block min-w-0">
        <span className="block truncate font-medium">
          {vehicle.registrationNumberDisplay}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {vehicle.make} {vehicle.model}
        </span>
      </span>
    ),
  },
  {
    header: 'Kund',
    cell: (vehicle: InspectionDueVehicle) =>
      vehicle.customer === null ? 'Ingen kund kopplad' : vehicle.customer.name,
  },
  {
    header: 'Besiktning',
    cell: (vehicle: InspectionDueVehicle) =>
      formatDateOnly(vehicle.nextInspectionDueDate),
  },
];

const vehicleColumns: readonly ReadOnlyColumn<Vehicle>[] = [
  {
    header: 'Regnr',
    cell: (vehicle: Vehicle) => (
      <span id={`vehicle-${vehicle.id}`} className="font-medium tabular-nums">
        {vehicle.registrationNumberDisplay}
      </span>
    ),
  },
  {
    header: 'Fordon',
    cell: (vehicle: Vehicle) => `${vehicle.make} ${vehicle.model}`,
  },
  {
    header: 'Besiktning',
    cell: (vehicle: Vehicle) =>
      vehicle.nextInspectionDueDate === null
        ? 'Saknas'
        : formatDateOnly(vehicle.nextInspectionDueDate),
  },
];

export default async function VehiclesPage({
  searchParams,
}: {
  readonly searchParams: Promise<AdminSearchParams>;
}) {
  const params = await searchParams;
  const inspectionFilter = firstSearchParam(params, 'besiktning');

  if (inspectionFilter === '60-dagar') {
    const dashboard = await apiFetchServer('/dashboard', dashboardSchema);

    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          breadcrumb={<span>Admin / Fordon</span>}
          title="Fordon"
          description="Fordon med besiktning nära i tiden."
          actions={
            <Badge tone="hivis">
              {dashboard.inspectionsDueSoonCount} inom 60 dagar
            </Badge>
          }
        />
        <ReadOnlyTable
          rows={dashboard.inspectionsDueSoon}
          columns={inspectionColumns}
          rowKey={(vehicle: InspectionDueVehicle) => vehicle.id}
          caption="Fordon med besiktning inom 60 dagar"
          empty={
            <EmptyState
              icon={CarFrontIcon}
              message="Inga fordon matchar besiktningsfiltret."
            />
          }
        />
      </div>
    );
  }

  const response = await apiFetchServer(
    '/vehicles?limit=20',
    vehicleListResponseSchema,
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={<span>Admin / Fordon</span>}
        title="Fordon"
        description="Fordon i registret."
      />
      <ReadOnlyTable
        rows={response.data}
        columns={vehicleColumns}
        rowKey={(vehicle: Vehicle) => vehicle.id}
        caption="Fordon"
        empty={
          <EmptyState icon={CarFrontIcon} message="Inga fordon finns än." />
        }
      />
    </div>
  );
}
