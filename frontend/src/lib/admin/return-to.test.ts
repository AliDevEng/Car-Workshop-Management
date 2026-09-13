import { describe, expect, it } from 'vitest';
import { sanitiseAdminReturnTo } from './return-to';

describe('sanitiseAdminReturnTo', () => {
  it('keeps local admin paths', () => {
    expect(sanitiseAdminReturnTo('/admin/kunder?filter=abc')).toBe(
      '/admin/kunder?filter=abc',
    );
  });

  it('rejects external URLs', () => {
    expect(sanitiseAdminReturnTo('https://example.com/admin')).toBe('/admin');
  });

  it('rejects non-admin and login targets', () => {
    expect(sanitiseAdminReturnTo('/')).toBe('/admin');
    expect(sanitiseAdminReturnTo('/admin/logga-in?returnTo=/admin')).toBe(
      '/admin',
    );
  });
});
