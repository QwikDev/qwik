import { component$ } from '@qwik.dev/core';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { getPathname, fixTrailingSlash, resolveRequestHandlers } from './resolve-request-handlers';
import { RequestEvHttpStatusMessage } from './request-event-core';
import { createRequestEvent } from './request-event';
import { RedirectMessage } from './redirect-handler';
import { isContentType } from './request-utils';
import type { ServerRequestEvent } from './types';
import { checkCSRF } from './resolve-request-handlers';
import type { LoadedRoute, RouteModule } from '../../runtime/src/types';
import { ServerError } from '@qwik.dev/router/middleware/request-handler';
import {
  _resetServerFunctionCacheForTest,
  configureCacheForServer,
  defineCacheConfig,
  runServerFunctionWithCache,
} from '../../runtime/src/server-function-cache';

type CapturingServerRequestEvent = ServerRequestEvent & {
  written: Uint8Array[];
};

function createMockServerRequestEvent(
  url = 'http://localhost:3000/test',
  init?: RequestInit
): CapturingServerRequestEvent {
  const mockRequest = new Request(url, init);
  const written: Uint8Array[] = [];

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
        write: vi.fn((chunk: Uint8Array) => {
          written.push(chunk);
        }),
        close: vi.fn(),
      };
      return {
        getWriter: () => writer,
        locked: false,
        pipeTo: vi.fn(),
      } as any;
    }),
    written,
  };
}

const justHiModule = { default: () => 'hi' };
const mockRoute: LoadedRoute = { $routeName$: '/', $params$: {}, $mods$: [justHiModule] };
function createMockRequestEvent(url = 'http://localhost:3000/test', trailingSlash = true) {
  globalThis.__NO_TRAILING_SLASH__ = !trailingSlash;
  const serverRequestEv = createMockServerRequestEvent(url);
  return createRequestEvent(serverRequestEv, mockRoute, [], '/', vi.fn());
}

afterEach(() => {
  _resetServerFunctionCacheForTest();
});

function readWrittenText(serverRequestEv: CapturingServerRequestEvent) {
  return new TextDecoder().decode(concatUint8Arrays(serverRequestEv.written));
}

function concatUint8Arrays(chunks: Uint8Array[]) {
  const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
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

  describe('qcomponent partial envelopes', () => {
    it('returns a JSON envelope with component cache and async resource metadata when requested', async () => {
      const ProductPartial = component$(() => 'Partial payload');
      const getProduct = Object.assign(() => {}, {
        __qwik_server_resource_hash__: 'product-hash',
      });
      configureCacheForServer(
        defineCacheConfig({
          defaults: {
            resources: {
              dedupe: true,
            },
            components: {
              store: 'memory',
              dedupe: true,
            },
          },
          optimize: {
            resources: {
              getProduct: {
                target: getProduct,
              },
            },
            components: {
              ProductPartial: {
                target: ProductPartial,
              },
            },
          },
        })
      );

      const resourceModule: RouteModule<any> = {
        onRequest: async (ev) => {
          await runServerFunctionWithCache(ev, 'product-hash', ['one'], () => 'value');
        },
      };

      const route: LoadedRoute = {
        $routeName$: '/',
        $params$: {},
        $mods$: [resourceModule, justHiModule as RouteModule],
      };
      const renderHandler = vi.fn();
      const handlers = resolveRequestHandlers(undefined, route, 'GET', false, renderHandler, false);

      const first = createMockServerRequestEvent(
        'http://localhost:3000/test?qcomponent=ProductPartial',
        {
          headers: {
            accept: 'application/json',
            'X-QCOMPONENT': 'ProductPartial',
          },
        }
      );
      const firstRequest = createRequestEvent(first, route, handlers, '/', vi.fn());

      await firstRequest.next();

      const firstPayload = JSON.parse(readWrittenText(first));
      expect(renderHandler).not.toHaveBeenCalled();
      expect(firstRequest.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
      expect(firstRequest.headers.get('X-Qwik-Component-Cache')).toBe('miss');
      expect(firstPayload).toMatchObject({
        type: 'qwik-component-partial',
        version: 1,
        standalone: true,
        component: {
          id: 'ProductPartial',
          name: 'ProductPartial',
        },
        cache: {
          status: 'miss',
        },
        resources: [
          {
            qrlHash: 'product-hash',
            status: 'resolved',
            source: 'run',
          },
        ],
      });
      expect(firstPayload.html).toContain('Partial payload');
      expect(firstPayload.component).not.toHaveProperty('policy');
      expect(firstPayload.cache).not.toHaveProperty('namespace');

      const second = createMockServerRequestEvent(
        'http://localhost:3000/test?qcomponent=ProductPartial',
        {
          headers: {
            accept: 'application/json',
            'X-QCOMPONENT': 'ProductPartial',
          },
        }
      );
      const secondRequest = createRequestEvent(second, route, handlers, '/', vi.fn());

      await secondRequest.next();

      const secondPayload = JSON.parse(readWrittenText(second));
      expect(secondRequest.headers.get('X-Qwik-Component-Cache')).toBe('hit');
      expect(secondPayload.cache.status).toBe('hit');
      expect(secondPayload.html).toContain('Partial payload');
    });

    it('keeps returning HTML for qcomponent requests that do not ask for JSON', async () => {
      const ProductPartial = component$(() => 'HTML partial');
      configureCacheForServer(
        defineCacheConfig({
          optimize: {
            components: {
              ProductPartial: {
                target: ProductPartial,
              },
            },
          },
        })
      );

      const route: LoadedRoute = {
        $routeName$: '/',
        $params$: {},
        $mods$: [justHiModule as RouteModule],
      };
      const handlers = resolveRequestHandlers(undefined, route, 'GET', false, vi.fn(), false);
      const serverRequest = createMockServerRequestEvent(
        'http://localhost:3000/test?qcomponent=ProductPartial',
        {
          headers: {
            'X-QCOMPONENT': 'ProductPartial',
          },
        }
      );
      const request = createRequestEvent(serverRequest, route, handlers, '/', vi.fn());

      await request.next();

      expect(request.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
      expect(readWrittenText(serverRequest)).toContain('HTML partial');
    });
  });

  describe('server error handling', () => {
    it('should catch public ServerError instances in page middleware', async () => {
      const route: LoadedRoute = {
        $routeName$: '/',
        $params$: {},
        $mods$: [
          {
            onRequest() {
              throw new ServerError(418, 'teapot');
            },
          } as RouteModule,
          justHiModule as RouteModule,
        ],
        $errorLoader$: vi.fn(async () => ({ default: () => null })),
      };
      const renderHandler = vi.fn(async (requestEv: { exit: () => void }) => {
        requestEv.exit();
      });
      const handlers = resolveRequestHandlers(undefined, route, 'GET', true, renderHandler, false);
      const requestEv = createRequestEvent(
        createMockServerRequestEvent(),
        route,
        handlers,
        '/',
        vi.fn()
      );

      await requestEv.next();

      expect(renderHandler).toHaveBeenCalledOnce();
      expect(requestEv.status()).toBe(418);
      expect(requestEv.sharedMap.get(RequestEvHttpStatusMessage)).toBe('teapot');
    });
  });
});
