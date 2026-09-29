import { describe, expect, test } from 'vitest';
import { sanitizeChunkGroupName } from './vite-utils';

describe('sanitizeChunkGroupName', () => {
  test('returns null for empty names', () => {
    expect(sanitizeChunkGroupName(null)).toBeNull();
    expect(sanitizeChunkGroupName(undefined)).toBeNull();
    expect(sanitizeChunkGroupName('')).toBeNull();
  });

  test('keeps a plain name as-is', () => {
    expect(sanitizeChunkGroupName('routes')).toBe('routes');
  });

  test('flattens path separators, which the bundler rejects in [name]', () => {
    expect(sanitizeChunkGroupName('src/routes/index')).toBe('src-routes-index');
    expect(sanitizeChunkGroupName('./src/routes')).toBe('src-routes');
    expect(sanitizeChunkGroupName('../../src/routes')).toBe('src-routes');
    expect(sanitizeChunkGroupName('src\\routes\\index')).toBe('src-routes-index');
  });

  test('suffixes reserved names so a segment cannot hijack the manifest pointers', () => {
    expect(sanitizeChunkGroupName('qwik-core')).toBe('qwik-core-segment');
    expect(sanitizeChunkGroupName('qwikloader')).toBe('qwikloader-segment');
    expect(sanitizeChunkGroupName('qwik-preloader')).toBe('qwik-preloader-segment');
  });
});
