import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  articleSchema,
  lowStockReportSchema,
  paginatedResponseSchema,
  stockMovementResultSchema,
  stockMovementWithUserSchema,
  stocktakeResultSchema,
  type Article,
  type CreateArticleInput,
  type StockAdjustmentInput,
  type StockMovementType,
  type StocktakeInput,
  type UpdateArticleInput,
} from 'shared';
import { apiFetch } from './client';
import { queryKeys } from './keys';

const articleListResponseSchema = paginatedResponseSchema(articleSchema);
const movementListResponseSchema = paginatedResponseSchema(
  stockMovementWithUserSchema,
);

export interface ArticleListParams {
  readonly q?: string;
  readonly lowStock?: boolean;
  readonly isActive?: boolean;
  readonly cursor?: string;
  readonly limit?: number;
}

export function articlesPath(params: ArticleListParams): string {
  const search = new URLSearchParams();
  if (params.q !== undefined && params.q !== '') {
    search.set('q', params.q);
  }
  if (params.lowStock !== undefined) {
    search.set('lowStock', String(params.lowStock));
  }
  if (params.isActive !== undefined) {
    search.set('isActive', String(params.isActive));
  }
  if (params.cursor !== undefined) {
    search.set('cursor', params.cursor);
  }
  if (params.limit !== undefined) {
    search.set('limit', String(params.limit));
  }
  const query = search.toString();
  return query === '' ? '/articles' : `/articles?${query}`;
}

export function useArticles(
  params: ArticleListParams,
  options?: { readonly enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.articles(params),
    queryFn: () => apiFetch(articlesPath(params), articleListResponseSchema),
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
  });
}

export function useArticle(id: string | null) {
  return useQuery({
    queryKey: queryKeys.article(id ?? ''),
    queryFn: () => apiFetch(`/articles/${id ?? ''}`, articleSchema),
    enabled: id !== null,
  });
}

export function useLowStockReport(options?: { readonly enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.lowStockArticles(),
    queryFn: () => apiFetch('/articles/low-stock', lowStockReportSchema),
    enabled: options?.enabled ?? true,
  });
}

/**
 * Not a fetch: the browser navigates here directly so the response's
 * `Content-Disposition` triggers a normal download carrying the session
 * cookie, exactly as any other same-origin link would (F7.5.2).
 */
export function lowStockExportPath(): string {
  return '/api/articles/low-stock/export';
}

async function invalidateArticleQueries(
  queryClient: QueryClient,
  id: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.articlesRoot() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.article(id) }),
  ]);
}

export function useCreateArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateArticleInput) =>
      apiFetch('/articles', articleSchema, { method: 'POST', body: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.articlesRoot(),
      });
    },
  });
}

export function useUpdateArticle(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateArticleInput) =>
      apiFetch(`/articles/${id}`, articleSchema, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: async () => {
      await invalidateArticleQueries(queryClient, id);
    },
  });
}

/** Toggles §4.3-style `isActive`, never a hard delete (CLAUDE.md). */
export function useSetArticleActive(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (isActive: boolean) =>
      apiFetch(
        `/articles/${id}/${isActive ? 'reactivate' : 'deactivate'}`,
        articleSchema,
        { method: 'POST' },
      ),
    onSuccess: async () => {
      await invalidateArticleQueries(queryClient, id);
    },
  });
}

export interface StockMovementListParams {
  readonly type?: StockMovementType;
  readonly cursor?: string;
  readonly limit?: number;
}

export function stockMovementsPath(
  articleId: string,
  params: StockMovementListParams,
): string {
  const search = new URLSearchParams();
  if (params.type !== undefined) {
    search.set('type', params.type);
  }
  if (params.cursor !== undefined) {
    search.set('cursor', params.cursor);
  }
  if (params.limit !== undefined) {
    search.set('limit', String(params.limit));
  }
  const query = search.toString();
  return query === ''
    ? `/articles/${articleId}/movements`
    : `/articles/${articleId}/movements?${query}`;
}

export function useStockMovements(
  articleId: string,
  params: StockMovementListParams,
) {
  return useQuery({
    queryKey: queryKeys.stockMovements(articleId, params),
    queryFn: () =>
      apiFetch(stockMovementsPath(articleId, params), movementListResponseSchema),
    placeholderData: keepPreviousData,
  });
}

/** F7.4 — "Inventera": takes the counted quantity, the server writes the
 * correcting movement for the difference. */
export function useStocktake(articleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: StocktakeInput) =>
      apiFetch(`/articles/${articleId}/stocktake`, stocktakeResultSchema, {
        method: 'POST',
        body: input,
      }),
    onSuccess: async () => {
      await Promise.all([
        invalidateArticleQueries(queryClient, articleId),
        queryClient.invalidateQueries({
          queryKey: queryKeys.stockMovementsRoot(articleId),
        }),
      ]);
    },
  });
}

/** F7.3.4 — "Justera lager": a manual, signed correction with a required note. */
export function useStockAdjustment(articleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: StockAdjustmentInput) =>
      apiFetch(
        `/articles/${articleId}/stock-adjustments`,
        stockMovementResultSchema,
        { method: 'POST', body: input },
      ),
    onSuccess: async () => {
      await Promise.all([
        invalidateArticleQueries(queryClient, articleId),
        queryClient.invalidateQueries({
          queryKey: queryKeys.stockMovementsRoot(articleId),
        }),
      ]);
    },
  });
}

export type { Article };
