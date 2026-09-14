import { describe, expect, it } from 'vitest';
import { customersPath } from './customers';
import { queryKeys } from './keys';

describe('customersPath', () => {
  it('omits the query string when there are no filters', () => {
    expect(customersPath({})).toBe('/customers');
  });

  it('encodes the search term, type and pagination together', () => {
    expect(
      customersPath({ q: 'Karlsson', type: 'PRIVATE', cursor: 'abc', limit: 25 }),
    ).toBe('/customers?q=Karlsson&type=PRIVATE&cursor=abc&limit=25');
  });

  it('serialises isActive explicitly rather than dropping false', () => {
    expect(customersPath({ isActive: false })).toBe('/customers?isActive=false');
  });
});

describe('customer query keys', () => {
  it('keys a list by its full parameter set', () => {
    expect(queryKeys.customers({ q: 'a' })).toEqual(['customers', { q: 'a' }]);
    expect(queryKeys.customers({ q: 'a' })).not.toEqual(
      queryKeys.customers({ q: 'b' }),
    );
  });

  it('keys a single customer by id under the same root', () => {
    expect(queryKeys.customer('c1')).toEqual(['customers', 'c1']);
  });
});
