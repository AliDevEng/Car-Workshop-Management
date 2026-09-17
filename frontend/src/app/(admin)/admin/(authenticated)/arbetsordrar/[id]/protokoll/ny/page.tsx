import { Suspense } from 'react';
import { NewServiceProtocolPage } from '@/components/admin/new-service-protocol';
import { DetailSkeleton } from '@/components/admin/states';

export default async function ArbetsordrarNyttProtokollPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <NewServiceProtocolPage key={id} workOrderId={id} />
    </Suspense>
  );
}
