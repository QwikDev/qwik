import { afterEach, describe, expect, it, vi } from 'vitest';
import { isStaticPath, staticPaths } from './static-paths';

const url = (pathname: string) => new URL(pathname, 'http://localhost:3000');

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it('should recognize build assets beneath the configured base', () => {
    vi.stubGlobal('__QWIK_ROUTER_BASE_PATHNAME__', '/docs/');
    expect(isStaticPath('GET', url('/docs/build/q-abc.js'))).toBe(true);
    expect(isStaticPath('HEAD', url('/docs/assets/logo.svg'))).toBe(true);
    expect(isStaticPath('GET', url('/build/q-abc.js'))).toBe(false);
    expect(isStaticPath('GET', url('/docstore/build/q-abc.js'))).toBe(false);
  });

  it('should combine the base with custom build and asset directories', () => {
    vi.stubGlobal('__QWIK_ROUTER_BASE_PATHNAME__', '/docs/');
    vi.stubGlobal('__QWIK_BUILD_DIR__', 'bundles');
    vi.stubGlobal('__QWIK_ASSETS_DIR__', 'media');
    expect(isStaticPath('GET', url('/docs/bundles/q-abc.js'))).toBe(true);
    expect(isStaticPath('GET', url('/docs/media/logo.svg'))).toBe(true);
  });

  it('should retain base-prefixed paths in the prerendered path lookup', () => {
    vi.stubGlobal('__QWIK_ROUTER_BASE_PATHNAME__', '/docs/');
    staticPaths.add('/docs/guide/');
    try {
      expect(isStaticPath('GET', url('/docs/guide/'))).toBe(true);
      expect(isStaticPath('GET', url('/guide/'))).toBe(false);
    } finally {
      staticPaths.delete('/docs/guide/');
    }
  });
});
