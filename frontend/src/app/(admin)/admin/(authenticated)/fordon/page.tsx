import { VehicleListPage } from '@/components/admin/vehicle-list';
import {
  firstSearchParam,
  type AdminSearchParams,
} from '@/lib/admin/search-params';

export default async function FordonPage({
  searchParams,
}: {
  readonly searchParams: Promise<AdminSearchParams>;
}) {
  const params = await searchParams;
  const initialQuery = firstSearchParam(params, 'q') ?? '';
  // `?besiktning=60-dagar` is the link the F5 dashboard's attention card
  // already uses (dashboard.tsx's `inspectionsHref`); F6.3.2 gives it a real,
  // paginated backend filter (`inspectionDueSoon`) instead of the dashboard's
  // own capped preview list.
  const initialInspectionDueSoon =
    firstSearchParam(params, 'besiktning') === '60-dagar';

  return (
    <VehicleListPage
      initialQuery={initialQuery}
      initialInspectionDueSoon={initialInspectionDueSoon}
    />
  );
}
