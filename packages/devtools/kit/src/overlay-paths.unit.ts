import { describe, expect, test } from 'vitest';
import { isExcludedPathname, normalizeExcludePathnames } from './overlay-paths';

describe('overlay path helpers', () => {
  test('normalizes excluded pathnames', () => {
    expect(normalizeExcludePathnames(['demo/', '/demo', '', '  docs  '])).toEqual([
      '/demo',
      '/docs',
    ]);
  });

  test('uses segment-aware prefix matching', () => {
    expect(isExcludedPathname('/demo', ['/demo'])).toBe(true);
    expect(isExcludedPathname('/demo/', ['/demo'])).toBe(true);
    expect(isExcludedPathname('/demo/getting-started/01-route/', ['/demo'])).toBe(true);
    expect(isExcludedPathname('/demolition', ['/demo'])).toBe(false);
    expect(isExcludedPathname('/docs/getting-started/', ['/demo'])).toBe(false);
  });
});
