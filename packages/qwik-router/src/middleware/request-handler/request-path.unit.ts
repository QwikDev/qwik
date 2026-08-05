import { afterEach, describe, expect, it } from 'vitest';
import {
  getLoaderName,
  recognizeRequest,
  resolveValidInternalFullPathname,
  trimInternalPathname,
  trimRecognizedInternalPathname,
} from './request-path';

describe('request path helpers', () => {
  afterEach(() => {
    globalThis.__NO_TRAILING_SLASH__ = false;
  });

  it('builds loader file names', () => {
    expect(getLoaderName('loader-id', 'manifest')).toBe('q-loader-loader-id.manifest.json');
  });

  it('trims internal loader pathnames and preserves trailing slash mode', () => {
    globalThis.__NO_TRAILING_SLASH__ = false;
    const loaderPathname = `/products/${getLoaderName('loader-id', 'manifest')}`;

    expect(trimInternalPathname(loaderPathname)).toBe('/products/');

    globalThis.__NO_TRAILING_SLASH__ = true;

    expect(trimInternalPathname(loaderPathname)).toBe('/products');
  });

  it('can trim an already recognized internal request', () => {
    globalThis.__NO_TRAILING_SLASH__ = false;
    const loaderPathname = `/${getLoaderName('loader-id', 'manifest')}`;
    const recognized = recognizeRequest(loaderPathname);

    expect(recognized).not.toBeNull();
    expect(trimRecognizedInternalPathname(loaderPathname, recognized!)).toBe('/');
  });

  it('recognizes only the final q-loader path segment', () => {
    const loaderPathname = `/q-loader-shared-map/two/nested/${getLoaderName(
      'loader-id',
      'manifest'
    )}`;
    const recognized = recognizeRequest(loaderPathname);

    expect(recognized?.data?.loaderId).toBe('loader-id');
    expect(trimRecognizedInternalPathname(loaderPathname, recognized!)).toBe(
      '/q-loader-shared-map/two/nested/'
    );
  });

  it('accepts internal full pathnames below the loader pathname', () => {
    expect(resolveValidInternalFullPathname('/products/123/', '/products/123/view/')).toBe(
      '/products/123/view/'
    );
  });

  it('rejects internal full pathnames outside the loader pathname', () => {
    expect(resolveValidInternalFullPathname('/products/123/', '/admin/')).toBeUndefined();
  });

  it('rejects protocol-relative internal full pathnames', () => {
    expect(resolveValidInternalFullPathname('/products/123/', '//evil.com/')).toBeUndefined();
  });
});
