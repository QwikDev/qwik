import { describe, expect, it } from 'vitest';
import { sanitizeChunkGroupName } from './vite-utils';

describe('sanitizeChunkGroupName', () => {
  it('returns null for empty input', () => {
    expect(sanitizeChunkGroupName(null)).toBe(null);
    expect(sanitizeChunkGroupName(undefined)).toBe(null);
    expect(sanitizeChunkGroupName('')).toBe(null);
  });

  it('passes a separator-free name through unchanged', () => {
    expect(sanitizeChunkGroupName('about')).toBe('about');
  });

  it('flattens path separators into a chunk-safe name', () => {
    expect(sanitizeChunkGroupName('src/routes/about.tsx')).toBe('src-routes-about.tsx');
  });

  it('disambiguates names that collide with reserved manifest bundle names', () => {
    // A user `manual` chunk name or a path that flattens to one of these must not hijack
    // the manifest's core/loader/preloader pointer.
    expect(sanitizeChunkGroupName('qwik-core')).toBe('qwik-core-segment');
    expect(sanitizeChunkGroupName('qwikloader')).toBe('qwikloader-segment');
    expect(sanitizeChunkGroupName('qwik-preloader')).toBe('qwik-preloader-segment');
    expect(sanitizeChunkGroupName('/qwik-core')).toBe('qwik-core-segment');
  });
});
