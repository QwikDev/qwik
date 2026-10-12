import { describe, expect, it } from 'vitest';
import { createCacheControl } from './cache-control';

describe('createCacheControl', () => {
  it('should keep zero-valued directives', () => {
    expect(
      createCacheControl({ maxAge: 0, sMaxAge: 0, staleWhileRevalidate: 0, staleIfError: 0 })
    ).toBe('max-age=0, s-maxage=0, stale-while-revalidate=0, stale-if-error=0');
  });

  it('should expand the zero number shorthand', () => {
    expect(createCacheControl(0)).toBe('max-age=0, s-maxage=0');
  });
});
