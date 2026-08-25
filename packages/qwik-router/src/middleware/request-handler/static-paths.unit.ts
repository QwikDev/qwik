import { describe, expect, it } from 'vitest';
import { isStaticPath } from './static-paths';

const url = (pathname: string) => new URL(pathname, 'http://localhost:3000');

describe('isStaticPath', () => {
  it('should serve build assets for GET', () => {
    expect(isStaticPath('GET', url('/build/q-abc.js'))).toBe(true);
    expect(isStaticPath('GET', url('/assets/logo.svg'))).toBe(true);
  });

  it('should serve build assets for HEAD', () => {
    expect(isStaticPath('HEAD', url('/build/q-abc.js'))).toBe(true);
    expect(isStaticPath('HEAD', url('/assets/logo.svg'))).toBe(true);
  });

  it('should accept a lowercase method', () => {
    expect(isStaticPath('head', url('/build/q-abc.js'))).toBe(true);
  });

  it('should reject methods that can change state', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      expect(isStaticPath(method, url('/build/q-abc.js'))).toBe(false);
    }
  });

  it('should reject a path that was not prerendered', () => {
    expect(isStaticPath('GET', url('/docs/getting-started/'))).toBe(false);
    expect(isStaticPath('HEAD', url('/docs/getting-started/'))).toBe(false);
  });
});
