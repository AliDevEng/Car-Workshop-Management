import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { invalidateDomains } from './invalidation';
import { queryKeys } from './keys';

function seeded(): QueryClient {
  const client = new QueryClient();
  client.setQueryData(queryKeys.dashboard(null), { seeded: true });
  client.setQueryData(queryKeys.article('a1'), { seeded: true });
  client.setQueryData(queryKeys.vehicle('v1'), { seeded: true });
  client.setQueryData(queryKeys.customer('c1'), { seeded: true });
  return client;
}

function isStale(client: QueryClient, key: readonly unknown[]): boolean {
  return client.getQueryState(key)?.isInvalidated ?? false;
}

describe('invalidateDomains', () => {
  it('marks every query under each named domain stale', async () => {
    const client = seeded();
    await invalidateDomains(client, ['dashboard', 'articles']);

    expect(isStale(client, queryKeys.dashboard(null))).toBe(true);
    expect(isStale(client, queryKeys.article('a1'))).toBe(true);
  });

  it('leaves domains that were not named alone', async () => {
    const client = seeded();
    await invalidateDomains(client, ['dashboard']);

    expect(isStale(client, queryKeys.vehicle('v1'))).toBe(false);
    expect(isStale(client, queryKeys.customer('c1'))).toBe(false);
  });
});
