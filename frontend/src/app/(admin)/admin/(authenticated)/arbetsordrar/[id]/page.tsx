import { WorkOrderDetailPage } from '@/components/admin/work-order-detail';

export default async function ArbetsordrarDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // `key={id}`: forces a full remount between two work orders' detail pages
  // (reached directly from search or history, without a round trip through
  // the list) so per-order client state — the conflict dialog, draft line
  // edits — cannot survive into the next order's screen.
  return <WorkOrderDetailPage key={id} workOrderId={id} />;
}
