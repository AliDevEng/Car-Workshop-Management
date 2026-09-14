import { describe, expect, it } from 'vitest';
import { odometerReadingsPath, vehiclesPath } from './vehicles';
import { queryKeys } from './keys';

describe('vehiclesPath', () => {
  it('omits the query string when there are no filters', () => {
    expect(vehiclesPath({})).toBe('/vehicles');
  });

  it('encodes the search term and inspection-due filter together', () => {
    expect(vehiclesPath({ q: 'ABC 12A', inspectionDueSoon: true })).toBe(
      '/vehicles?q=ABC+12A&inspectionDueSoon=true',
    );
  });

  it('encodes the customer filter used by the customer detail page', () => {
    expect(vehiclesPath({ customerId: 'c1' })).toBe('/vehicles?customerId=c1');
  });
});

describe('odometerReadingsPath', () => {
  it('has no query string on the first page', () => {
    expect(odometerReadingsPath('v1')).toBe('/vehicles/v1/odometer-readings');
  });

  it('carries the cursor on a later page', () => {
    expect(odometerReadingsPath('v1', 'abc')).toBe(
      '/vehicles/v1/odometer-readings?cursor=abc',
    );
  });
});

describe('vehicle query keys', () => {
  it('keys a list by its full parameter set', () => {
    expect(queryKeys.vehicles({ q: 'a' })).toEqual(['vehicles', { q: 'a' }]);
  });

  it('keys odometer readings under the vehicle id', () => {
    expect(queryKeys.odometerReadings('v1')).toEqual([
      'vehicles',
      'v1',
      'odometer-readings',
    ]);
  });
});
