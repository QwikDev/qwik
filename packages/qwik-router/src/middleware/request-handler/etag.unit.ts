import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultLoaderCacheKey, defaultSsrCacheKey, resolveCacheKey } from './etag';
import { QLoaderId } from './request-path';

describe('resolveCacheKey', () => {
  const requestEv = {} as any;
  const defaultKey = vi.fn(() => 'default-key');

  beforeEach(() => {
    defaultKey.mockClear();
  });

  it('returns the default key for true', () => {
    expect(resolveCacheKey(true, defaultKey, requestEv, '')).toBe('default-key');
    expect(defaultKey).toHaveBeenCalledWith(requestEv, '');
  });

  it('returns an empty string when caching is not configured', () => {
    expect(resolveCacheKey(undefined, defaultKey, requestEv, '')).toBe('');
    expect(defaultKey).not.toHaveBeenCalled();
  });

  it('normalizes callback null and empty string to an empty internal cache key', () => {
    const nullKey = vi.fn(() => null);
    const emptyKey = vi.fn(() => '');

    expect(resolveCacheKey(nullKey, defaultKey, requestEv, 'etag')).toBe('');
    expect(resolveCacheKey(emptyKey, defaultKey, requestEv, 'etag')).toBe('');
    expect(defaultKey).not.toHaveBeenCalled();
  });
});

describe('default cache keys', () => {
  it('builds the SSR key from request status and pathname', () => {
    const requestEv = {
      status: vi.fn(() => 200),
      url: new URL('http://localhost/products/'),
    } as any;

    expect(defaultSsrCacheKey(requestEv, 'etag')).toBe('200|etag|/products/');
    expect(defaultSsrCacheKey(requestEv, '')).toBe('200|/products/');
  });

  it('builds the loader key from request path and sharedMap loader metadata', () => {
    const requestEv = {
      url: new URL('http://localhost/products/?page=2&q=shoes'),
      sharedMap: new Map<string, unknown>([[QLoaderId, 'loader-id']]),
    } as any;

    expect(defaultLoaderCacheKey(requestEv, 'etag')).toBe(
      '/products/|?page=2&q=shoes|loader-id|etag'
    );
    expect(defaultLoaderCacheKey(requestEv, '')).toBe('/products/|?page=2&q=shoes|loader-id');
  });
});
