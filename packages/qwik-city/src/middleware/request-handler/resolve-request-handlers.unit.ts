import { describe, it, expect } from 'vitest';
import { getPathname } from './resolve-request-handlers';

describe('resolve-request-handler', () => {
  describe('getPathname', () => {
    it('should remove q-data.json', () => {
      expect(getPathname(new URL('http://server/path/q-data.json?foo=bar#hash'), true)).toBe(
        '/path/?foo=bar#hash'
      );
      expect(getPathname(new URL('http://server/path/q-data.json?foo=bar#hash'), false)).toBe(
        '/path?foo=bar#hash'
      );
    });

    it('should pass non q-data.json through', () => {
      expect(getPathname(new URL('http://server/path?foo=bar#hash'), true)).toBe(
        '/path/?foo=bar#hash'
      );
      expect(getPathname(new URL('http://server/path/?foo=bar#hash'), false)).toBe(
        '/path?foo=bar#hash'
      );
    });

    it('should remove internal search params', () => {
      expect(getPathname(new URL('http://server/path?qaction=123&qdata=data'), true)).toBe(
        '/path/'
      );
      expect(getPathname(new URL('http://server/path?foo=1&qfunc=f&bar=2'), false)).toBe(
        '/path?foo=1&bar=2'
      );
    });
  });
});
