import { describe, expect, it, vi } from 'vitest';
import { resolveCacheKey } from './etag';

describe('resolveCacheKey', () => {
  const requestEv = {} as any;

  it('returns the default key for true', () => {
    expect(resolveCacheKey(true, 'default-key', requestEv, '')).toBe('default-key');
  });

  it('returns an empty string when caching is not configured', () => {
    expect(resolveCacheKey(undefined, 'default-key', requestEv, '')).toBe('');
  });

  it('normalizes callback null and empty string to an empty internal cache key', () => {
    const nullKey = vi.fn(() => null);
    const emptyKey = vi.fn(() => '');

    expect(resolveCacheKey(nullKey, 'default-key', requestEv, 'etag')).toBe('');
    expect(resolveCacheKey(emptyKey, 'default-key', requestEv, 'etag')).toBe('');
  });
});
