import { CustomerListPage } from '@/components/admin/customer-list';
import {
  firstSearchParam,
  type AdminSearchParams,
} from '@/lib/admin/search-params';

export default async function KunderPage({
  searchParams,
}: {
  readonly searchParams: Promise<AdminSearchParams>;
}) {
  const params = await searchParams;
  const initialQuery = firstSearchParam(params, 'q') ?? '';

  return <CustomerListPage initialQuery={initialQuery} />;
}
