import { WorkOrderListPage } from '@/components/admin/work-order-list';
import {
  firstSearchParam,
  type AdminSearchParams,
} from '@/lib/admin/search-params';

export default async function ArbetsordrarPage({
  searchParams,
}: {
  readonly searchParams: Promise<AdminSearchParams>;
}) {
  const params = await searchParams;
  const status = firstSearchParam(params, 'status');
  const bookingId = firstSearchParam(params, 'bookingId');

  return (
    <WorkOrderListPage
      {...(status === undefined ? {} : { initialStatus: status })}
      {...(bookingId === undefined ? {} : { initialBookingId: bookingId })}
    />
  );
}
