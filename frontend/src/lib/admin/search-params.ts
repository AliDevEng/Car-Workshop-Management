export type AdminSearchParams = Record<string, string | string[] | undefined>;

export function firstSearchParam(
  searchParams: AdminSearchParams,
  key: string,
): string | undefined {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}
