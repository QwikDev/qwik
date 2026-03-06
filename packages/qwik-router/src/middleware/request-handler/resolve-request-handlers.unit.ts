import { describe, it, expect } from 'vitest';
import { getPathname } from './resolve-request-handlers';

describe('resolve-request-handler', () => {
  describe('getPathname', () => {
    it('should remove q-data.json', () => {
      globalThis.__NO_TRAILING_SLASH__ = false;
      expect(getPathname(new URL('http://server/path/q-data.json?foo=bar#hash'))).toBe(
        '/path/?foo=bar#hash'
      );
      globalThis.__NO_TRAILING_SLASH__ = true;
      expect(getPathname(new URL('http://server/path/q-data.json?foo=bar#hash'))).toBe(
        '/path?foo=bar#hash'
      );
    });

    it('should pass non q-data.json through', () => {
      globalThis.__NO_TRAILING_SLASH__ = false;
      expect(getPathname(new URL('http://server/path?foo=bar#hash'))).toBe('/path/?foo=bar#hash');
      globalThis.__NO_TRAILING_SLASH__ = true;
      expect(getPathname(new URL('http://server/path/?foo=bar#hash'))).toBe('/path?foo=bar#hash');
    });

    it('should remove internal search params', () => {
      globalThis.__NO_TRAILING_SLASH__ = false;
      expect(getPathname(new URL('http://server/path?qaction=123&qdata=data'))).toBe('/path/');
      globalThis.__NO_TRAILING_SLASH__ = true;
      expect(getPathname(new URL('http://server/path?foo=1&qfunc=f&bar=2'))).toBe(
        '/path?foo=1&bar=2'
      );
      expect(getPathname(new URL('http://server/path?foo=1&qloaders=f&bar=2'))).toBe(
        '/path?foo=1&bar=2'
      );
    });
  });
});
