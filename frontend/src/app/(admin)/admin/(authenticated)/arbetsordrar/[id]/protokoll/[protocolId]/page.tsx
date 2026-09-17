import { ServiceProtocolDetailPage } from '@/components/admin/service-protocol-detail';

export default async function ArbetsordrarProtokollDetailPage({
  params,
}: {
  readonly params: Promise<{ protocolId: string }>;
}) {
  const { protocolId } = await params;
  return <ServiceProtocolDetailPage key={protocolId} protocolId={protocolId} />;
}
