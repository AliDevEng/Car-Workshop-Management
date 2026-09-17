import { useQuery } from '@tanstack/react-query';
import {
  checklistTemplateListResponseSchema,
  checklistTemplateResponseSchema,
  type ServiceType,
} from 'shared';
import { apiFetch } from './client';
import { queryKeys } from './keys';

export interface ChecklistTemplateListParams {
  readonly serviceType?: ServiceType;
  readonly isActive?: boolean;
  readonly limit?: number;
}

function templatesPath(params: ChecklistTemplateListParams): string {
  const search = new URLSearchParams();
  if (params.serviceType !== undefined) {
    search.set('serviceType', params.serviceType);
  }
  if (params.isActive !== undefined) {
    search.set('isActive', String(params.isActive));
  }
  if (params.limit !== undefined) {
    search.set('limit', String(params.limit));
  }
  const query = search.toString();
  return query === '' ? '/checklist-templates' : `/checklist-templates?${query}`;
}

/** F10.3.2 — the templates a checklist can be created from. */
export function useChecklistTemplates(params: ChecklistTemplateListParams) {
  return useQuery({
    queryKey: queryKeys.checklistTemplates(params),
    queryFn: () =>
      apiFetch(templatesPath(params), checklistTemplateListResponseSchema),
  });
}

/** The full item list for one template, needed to render its checklist. */
export function useChecklistTemplate(id: string | null) {
  return useQuery({
    queryKey: queryKeys.checklistTemplate(id ?? ''),
    queryFn: async () => {
      const response = await apiFetch(
        `/checklist-templates/${id ?? ''}`,
        checklistTemplateResponseSchema,
      );
      return response.template;
    },
    enabled: id !== null,
  });
}
