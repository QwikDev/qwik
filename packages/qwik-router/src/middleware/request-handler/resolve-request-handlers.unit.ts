import { describe, it, expect, vi } from 'vitest';
import { getPathname, isContentType, fixTrailingSlash } from './resolve-request-handlers';
import { createRequestEvent } from './request-event';
import { RedirectMessage } from './redirect-handler';
import type { ServerRequestEvent } from './types';
import { checkCSRF } from './resolve-request-handlers';

function createMockServerRequestEvent(url = 'http://localhost:3000/test'): ServerRequestEvent {
  const mockRequest = new Request(url);

  return {
    mode: 'server',
    url: new URL(url),
    locale: undefined,
    platform: {},
    request: mockRequest,
    env: {
      get: vi.fn(),
    },
    getClientConn: vi.fn(() => ({ ip: '127.0.0.1' })),
    getWritableStream: vi.fn(() => {
      const writer = {
        write: vi.fn(),
        close: vi.fn(),
      };
      return {
        getWriter: () => writer,
        locked: false,
        pipeTo: vi.fn(),
      } as any;
    }),
  };
}

function createMockRequestEvent(url = 'http://localhost:3000/test', trailingSlash = true) {
  globalThis.__NO_TRAILING_SLASH__ = !trailingSlash;
  const serverRequestEv = createMockServerRequestEvent(url);
  return createRequestEvent(serverRequestEv, null, [], '/', vi.fn());
}

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

  describe('fixTrailingSlash', () => {
    describe('protocol-relative URL prevention', () => {
      it('should prevent redirect with protocol-relative URL //evil.com', () => {
        const requestEv = createMockRequestEvent('http://localhost:3000//evil.com', true);

        fixTrailingSlash(requestEv);
      });

      it('should prevent redirect with multiple leading slashes ///evil.com', () => {
        const requestEv = createMockRequestEvent('http://localhost:3000///evil.com', true);

        fixTrailingSlash(requestEv);
      });

      it('should prevent redirect with protocol-relative URL //evil.com/path', () => {
        const requestEv = createMockRequestEvent('http://localhost:3000//evil.com/path', true);

        fixTrailingSlash(requestEv);
      });
    });

    describe('trailing slash enforcement', () => {
      it('should add trailing slash when trailingSlash is true and path has no slash', () => {
        const requestEv = createMockRequestEvent('http://localhost:3000/about', true);

        expect(() => fixTrailingSlash(requestEv)).toThrow(RedirectMessage);
        expect(requestEv.headers.get('Location')).toBe('/about/');
      });

      it('should not redirect when trailingSlash is true and path has slash', () => {
        const requestEv = createMockRequestEvent('http://localhost:3000/about/', true);

        fixTrailingSlash(requestEv);
      });

      it('should remove trailing slash when trailingSlash is false and path has slash', () => {
        const requestEv = createMockRequestEvent('http://localhost:3000/about/', false);

        expect(() => fixTrailingSlash(requestEv)).toThrow(RedirectMessage);
        expect(requestEv.headers.get('Location')).toBe('/about');
      });

      it('should not redirect when trailingSlash is false and path has no slash', () => {
        const requestEv = createMockRequestEvent('http://localhost:3000/about', false);

        fixTrailingSlash(requestEv);
      });

      it('should preserve query string in redirect', () => {
        const requestEv = createMockRequestEvent('http://localhost:3000/about?foo=bar', true);

        expect(() => fixTrailingSlash(requestEv)).toThrow(RedirectMessage);
        expect(requestEv.headers.get('Location')).toBe('/about/?foo=bar');
      });

      it('should not redirect .html files', () => {
        const requestEv = createMockRequestEvent('http://localhost:3000/page.html', true);

        fixTrailingSlash(requestEv);
      });

      it('should not redirect basePathname', () => {
        const requestEv = createMockRequestEvent('http://localhost:3000/', true);

        fixTrailingSlash(requestEv);
      });
    });
  });
});
