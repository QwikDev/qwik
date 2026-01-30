import { describe, it, expect } from 'vitest';
import { getPathname, isContentType } from './resolve-request-handlers';
import { checkCSRF } from './resolve-request-handlers';

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

  describe('isContentType', () => {
    it('should correctly identify form/data', () => {
      const headers = new Headers({
        'content-type':
          'multipart/form-data; boundary=---------------------------5509475224001460121912752931',
      });
      expect(isContentType(headers, 'multipart/form-data')).toBe(true);
    });

    it('should correctly identify type with mixed casing', () => {
      const headers = new Headers({
        'content-type': 'tEXt/PlaiN; charset=utf-8',
      });
      expect(isContentType(headers, 'text/plain')).toBe(true);
    });

    it('should split on comma to prevent Content-Type smuggling', () => {
      const headers = new Headers({
        'content-type': 'application/x-www-form-urlencoded, bypass',
      });
      expect(isContentType(headers, 'application/x-www-form-urlencoded')).toBe(true);
    });
  });

  describe('checkCSRF', () => {
    it('should throw for cross-origin form submissions', () => {
      const ev: any = {
        request: {
          headers: new Headers({
            'content-type': 'text/plain; charset=utf-8',
            origin: 'http://evil.com',
          }),
        },
        url: new URL('http://server/path'),
        method: 'POST',
        error: (status: number, msg: string) => new Error(msg),
      };

      expect(() => checkCSRF(ev)).toThrow(/CSRF check failed/);
    });

    it('should throw for mixed type casing form submissions', () => {
      const ev: any = {
        request: {
          headers: new Headers({
            'content-type': 'TexT/pLaIn; charset=utf-8',
            origin: 'http://server/path',
          }),
        },
        url: new URL('http://server/path'),
        method: 'POST',
        error: (status: number, msg: string) => new Error(msg),
      };

      expect(() => checkCSRF(ev)).toThrow(/CSRF check failed/);
    });

    it('should throw for missing content-type header form submissions', () => {
      const ev: any = {
        request: {
          headers: new Headers({
            origin: 'http://server/path',
          }),
        },
        url: new URL('http://server/path'),
        method: 'POST',
        error: (status: number, msg: string) => new Error(msg),
      };

      expect(() => checkCSRF(ev)).toThrow(/CSRF check failed/);
    });

    it('should allow same-origin form submissions', () => {
      const ev: any = {
        request: {
          headers: new Headers({
            'content-type': 'text/plain; charset=utf-8',
            origin: 'http://server',
          }),
        },
        url: new URL('http://server/path'),
        method: 'POST',
        error: (status: number, msg: string) => new Error(msg),
      };

      // Should not throw
      checkCSRF(ev);
    });

    it('should allow when lax-proto and only scheme differs', () => {
      const ev: any = {
        request: {
          headers: new Headers({
            'content-type': 'text/plain; charset=utf-8',
            origin: 'https://server',
          }),
        },
        url: new URL('http://server/path'),
        method: 'POST',
        error: (status: number, msg: string) => new Error(msg),
      };

      // Should not throw
      checkCSRF(ev, 'lax-proto');
    });

    it('should not check origin for non-form content-types', () => {
      const ev: any = {
        request: {
          headers: new Headers({
            'content-type': 'application/json',
            origin: 'http://evil.com',
          }),
        },
        url: new URL('http://server/path'),
        method: 'POST',
        error: (status: number, msg: string) => new Error(msg),
      };

      // Should not throw
      checkCSRF(ev);
    });

    it('should throw for Content-Type smuggling via comma', () => {
      const ev: any = {
        request: {
          headers: new Headers({
            'content-type': 'application/x-www-form-urlencoded, bypass',
            origin: 'http://server/path',
          }),
        },
        url: new URL('http://server/path'),
        method: 'POST',
        error: (status: number, msg: string) => new Error(msg),
      };

      expect(() => checkCSRF(ev)).toThrow(/CSRF check failed/);
    });
  });
});
