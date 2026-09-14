import { VehicleDetailPage } from '@/components/admin/vehicle-detail';

export default async function FordonDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <VehicleDetailPage vehicleId={id} />;
}
