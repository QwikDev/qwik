import { describe, expect, it } from 'vitest';
import { sanitizeChunkGroupName, toDevPath } from './vite-utils';

describe('toDevPath', () => {
  it('returns a root-relative URL for an in-root file', () => {
    expect(toDevPath('/proj/src/routes/a/index.tsx', '/proj')).toBe('/src/routes/a/index.tsx');
  });

  it('tolerates a trailing slash on the root', () => {
    expect(toDevPath('/proj/src/a.tsx', '/proj/')).toBe('/src/a.tsx');
  });

  it('does not treat a sibling dir sharing the root name prefix as in-root', () => {
    expect(toDevPath('/proj-legacy/src/x.tsx', '/proj')).toBe('/@fs/proj-legacy/src/x.tsx');
  });

  it("uses Vite's /@fs/ form for a file outside the root (e.g. a workspace package)", () => {
    expect(toDevPath('/home/me/packages/ui/Button.tsx', '/home/me/apps/web')).toBe(
      '/@fs/home/me/packages/ui/Button.tsx'
    );
  });

  it('preserves a Windows drive in the /@fs/ form when out of root', () => {
    expect(toDevPath('C:/other/x.tsx', 'C:/proj')).toBe('/@fs/C:/other/x.tsx');
  });

  it('roots a Windows in-root file', () => {
    expect(toDevPath('C:/proj/src/a.tsx', 'C:/proj')).toBe('/src/a.tsx');
  });
});

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
