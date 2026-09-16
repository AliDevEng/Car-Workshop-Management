import { useQuery } from '@tanstack/react-query';
import { partnerLinkListResponseSchema, type PartnerLink } from 'shared';
import { apiFetch } from './client';
import { queryKeys } from './keys';

export interface PartnerLinkListParams {
  readonly isActive?: boolean;
}

function partnerLinksPath(params: PartnerLinkListParams): string {
  if (params.isActive === undefined) {
    return '/partner-links';
  }
  return `/partner-links?isActive=${String(params.isActive)}`;
}

/**
 * F8.7.2 — partner deep links, read on the vehicle and article pages (§7.2,
 * B10.6). Read-only here; creating and reordering links is F11's settings
 * surface.
 */
export function usePartnerLinks(params: PartnerLinkListParams = {}) {
  return useQuery({
    queryKey: queryKeys.partnerLinks(params),
    queryFn: () => apiFetch(partnerLinksPath(params), partnerLinkListResponseSchema),
    staleTime: 5 * 60_000,
  });
}

export type { PartnerLink };
