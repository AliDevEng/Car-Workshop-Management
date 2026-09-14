import { CustomerDetailPage } from '@/components/admin/customer-detail';

export default async function KundDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomerDetailPage customerId={id} />;
}
