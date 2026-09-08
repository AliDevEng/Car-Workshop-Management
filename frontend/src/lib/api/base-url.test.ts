import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getApiBaseUrl } from './base-url';

describe('getApiBaseUrl (server branch)', () => {
  const original = process.env['INTERNAL_API_URL'];

  beforeEach(() => {
    delete process.env['INTERNAL_API_URL'];
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env['INTERNAL_API_URL'];
    } else {
      process.env['INTERNAL_API_URL'] = original;
    }
  });

  it('appends the /api prefix to the documented bare origin', () => {
    // The value shipped in .env.example and the root README is an origin with
    // no path; every backend route lives under /api. Returning it verbatim
    // produced http://127.0.0.1:3001/health — a 404 that surfaced only as
    // "backend unreachable" in server components.
    process.env['INTERNAL_API_URL'] = 'http://127.0.0.1:3001';
    expect(getApiBaseUrl()).toBe('http://127.0.0.1:3001/api');
  });

  it('does not double the prefix when the value already carries it', () => {
    process.env['INTERNAL_API_URL'] = 'http://backend:3001/api';
    expect(getApiBaseUrl()).toBe('http://backend:3001/api');
  });

  it('tolerates a trailing slash', () => {
    process.env['INTERNAL_API_URL'] = 'http://backend:3001/';
    expect(getApiBaseUrl()).toBe('http://backend:3001/api');
  });

  it('throws a readable error when the variable is missing', () => {
    expect(() => getApiBaseUrl()).toThrow(/INTERNAL_API_URL is not set/);
  });

  it('treats an empty value as missing rather than as an origin', () => {
    process.env['INTERNAL_API_URL'] = '';
    expect(() => getApiBaseUrl()).toThrow(/INTERNAL_API_URL is not set/);
  });
});
