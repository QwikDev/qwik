import { describe, it, expect, vi } from 'vitest';
import {
  getPathname,
  fixTrailingSlash,
  resolveRequestHandlers,
  streamServerFunctionResult,
} from './resolve-request-handlers-core';
import { RequestEvHttpStatusMessage, RequestEvSharedActionId } from './request-event-core';
import { createRequestEvent } from './request-event-core';
import { RedirectMessage } from './redirect-handler';
import { isContentType } from './request-utils';
import type { RequestEvent, ServerRequestEvent } from './types';
import { checkCSRF } from './resolve-request-handlers-core';
import type { LoadedRoute, RouteModule } from '../../runtime/src/types';
import { ServerError } from '@qwik.dev/router/middleware/request-handler';
import { IsQLoader, QLoaderId } from './request-path';
import { getRouteLoaderValues } from '../../runtime/src/route-loaders';

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

const justHiModule = { default: () => 'hi' };
const mockRoute: LoadedRoute = { $routeName$: '/', $params$: {}, $mods$: [justHiModule] };
function createMockRequestEvent(url = 'http://localhost:3000/test', trailingSlash = true) {
  globalThis.__NO_TRAILING_SLASH__ = !trailingSlash;
  const serverRequestEv = createMockServerRequestEvent(url);
  return createRequestEvent(serverRequestEv, mockRoute, [], '/', vi.fn());
}

describe('resolve-request-handler', () => {
  describe('getPathname', () => {
    it('should handle pathname with trailing slash', () => {
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

  describe('page middleware for q-loader requests', () => {
    it('does not run root index middleware for a root layout loader request', async () => {
      const layoutLoader = vi.fn() as any;
      layoutLoader.__brand = 'server_loader';
      layoutLoader.__id = 'layout-loader';
      const pageOnRequest = vi.fn();
      const route: LoadedRoute = {
        $routeName$: '/',
        $params$: {},
        $mods$: [
          { useLayoutData: layoutLoader },
          { default: vi.fn(), onRequest: pageOnRequest },
        ] as any,
      };

      const handlers = resolveRequestHandlers(undefined, route, 'GET', false, vi.fn());

      await handlers[3]({
        sharedMap: new Map([
          [IsQLoader, true],
          [QLoaderId, 'layout-loader'],
        ] as any),
      } as any);

      expect(pageOnRequest).not.toHaveBeenCalled();
    });

    it('runs page middleware for a synthetic preloaded loader export on that page module', async () => {
      const pageLoader = vi.fn() as any;
      pageLoader.__brand = 'server_loader';
      pageLoader.__id = 'page-loader';
      const pageOnRequest = vi.fn();
      const route: LoadedRoute = {
        $routeName$: '/',
        $params$: {},
        $mods$: [
          {},
          { default: vi.fn(), onRequest: pageOnRequest, __preloadedRouteLoader: pageLoader },
        ] as any,
      };

      const handlers = resolveRequestHandlers(undefined, route, 'GET', false, vi.fn());

      await handlers[3]({
        sharedMap: new Map([
          [IsQLoader, true],
          [QLoaderId, 'page-loader'],
        ] as any),
      } as any);

      expect(pageOnRequest).toHaveBeenCalledTimes(1);
    });
  });

  describe('server function request isolation', () => {
    it('runs server functions before route middleware and route loaders', async () => {
      const routeOnRequest = vi.fn();
      const routeLoader = vi.fn() as any;
      routeLoader.__brand = 'server_loader';
      routeLoader.__id = 'route-loader';
      const route: LoadedRoute = {
        $routeName$: '/public/',
        $params$: {},
        $mods$: [
          {
            default: vi.fn(),
            onRequest: routeOnRequest,
            useRouteData: routeLoader,
          },
        ] as any,
      };

      const handlers = resolveRequestHandlers(undefined, route, 'POST', false, vi.fn());
      const ev = {
        query: new URLSearchParams('qfunc=missing-hash'),
        request: new Request('http://localhost/public/?qfunc=missing-hash', {
          method: 'POST',
          headers: {
            'X-QRL': 'missing-hash',
            'Content-Type': 'application/qwik-json',
          },
        }),
        error: vi.fn((status: number, message: string) => ({ status, message })),
        exit: vi.fn(),
        parseBody: vi.fn(async () => [[]]),
        headers: new Headers(),
      } as any;

      await expect(handlers[2](ev)).rejects.toEqual({ status: 500, message: 'Invalid request' });

      expect(ev.exit).toHaveBeenCalledTimes(1);
      expect(routeOnRequest).not.toHaveBeenCalled();
      expect(routeLoader).not.toHaveBeenCalled();
    });

    it('keeps server plugin middleware before server functions', () => {
      const serverPluginOnRequest = vi.fn();
      const routeOnRequest = vi.fn();
      const route: LoadedRoute = {
        $routeName$: '/public/',
        $params$: {},
        $mods$: [{ default: vi.fn(), onRequest: routeOnRequest }] as any,
      };

      const handlers = resolveRequestHandlers(
        [{ onRequest: serverPluginOnRequest }] as any,
        route,
        'POST',
        false,
        vi.fn()
      );

      expect(handlers[2]).toBe(serverPluginOnRequest);
      expect(handlers[3]).not.toBe(routeOnRequest);
      expect(handlers[4]).not.toBe(routeOnRequest);
      handlers[4]({ sharedMap: new Map() } as any);
      expect(routeOnRequest).toHaveBeenCalledTimes(1);
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
        $errorLoader$: [vi.fn(async () => ({ default: () => null }))],
      };
      const renderHandler = vi.fn(async (requestEv: { exit: () => void }) => {
        requestEv.exit();
      });
      const handlers = resolveRequestHandlers(undefined, route, 'GET', true, renderHandler);
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

  describe('blockSSR loaders middleware', () => {
    function makeLoader(
      id: string,
      impl: (...args: any[]) => unknown,
      { blockSSR = true }: { blockSSR?: boolean } = {}
    ) {
      const loader: any = () => {};
      loader.__brand = 'server_loader';
      loader.__id = id;
      loader.__qrl = { call: (_thisArg: unknown, ev: unknown) => impl(ev), getHash: () => id };
      loader.__validators = undefined;
      loader.__serializationStrategy = 'never';
      loader.__search = undefined;
      loader.__blockSSR = blockSSR;
      return loader;
    }

    function pageRouteWithLoaders(...loaders: unknown[]): LoadedRoute {
      const loaderModule: Record<string, unknown> = {};
      loaders.forEach((loader, i) => (loaderModule[`useData${i}`] = loader));
      return {
        $routeName$: '/',
        $params$: {},
        $mods$: [loaderModule, { default: () => null }] as any,
        $errorLoader$: [vi.fn(async () => ({ default: () => null }))],
      };
    }

    function runPage(route: LoadedRoute, renderHandler: any) {
      globalThis.__NO_TRAILING_SLASH__ = false;
      const handlers = resolveRequestHandlers(undefined, route, 'GET', true, renderHandler);
      const requestEv = createRequestEvent(
        createMockServerRequestEvent('http://localhost:3000/'),
        route,
        handlers,
        '/',
        vi.fn()
      );
      return requestEv;
    }

    const exitRender = () =>
      vi.fn((requestEv: { exit: () => void }) => {
        requestEv.exit();
      });

    it('starts every loader during the request', async () => {
      const blocking = vi.fn(() => 'a');
      const background = vi.fn(() => 'b');
      const route = pageRouteWithLoaders(
        makeLoader('a', blocking),
        makeLoader('b', background, { blockSSR: false })
      );
      const requestEv = runPage(route, exitRender());

      await requestEv.next();

      expect(blocking).toHaveBeenCalledTimes(1);
      expect(background).toHaveBeenCalledTimes(1);
    });

    it('does not await blockSSR:false loaders before render', async () => {
      let release!: () => void;
      const gate = new Promise<string>((resolve) => (release = () => resolve('late')));
      const route = pageRouteWithLoaders(makeLoader('l1', () => gate, { blockSSR: false }));
      const renderHandler = exitRender();
      const requestEv = runPage(route, renderHandler);

      // Resolves without awaiting the still-pending background loader.
      await requestEv.next();

      expect(renderHandler).toHaveBeenCalledOnce();
      release();
    });

    it('errors the response when a blockSSR loader errors, before render', async () => {
      const route = pageRouteWithLoaders(
        makeLoader('l1', () => {
          throw new ServerError(401, 'boom');
        })
      );
      const requestEv = runPage(route, exitRender());

      await requestEv.next();

      expect(requestEv.status()).toBe(401);
      expect(requestEv.sharedMap.get(RequestEvHttpStatusMessage)).toBe('boom');
    });

    it('clears resolved route loader data before rendering a ServerError page', async () => {
      const route = pageRouteWithLoaders(
        makeLoader('protected', () => ({ secret: 'hidden' })),
        makeLoader('guard', () => {
          throw new ServerError(401, 'login required');
        })
      );
      const renderHandler = vi.fn((requestEv: RequestEvent) => {
        expect(getRouteLoaderValues(requestEv)).toEqual({});
        requestEv.exit();
      });
      const requestEv = runPage(route, renderHandler);

      await requestEv.next();

      expect(renderHandler).toHaveBeenCalledOnce();
      expect(requestEv.status()).toBe(401);
      expect(requestEv.sharedMap.get(RequestEvHttpStatusMessage)).toBe('login required');
    });

    it('reports the first blockSSR loader (in route order) that errors', async () => {
      const route = pageRouteWithLoaders(
        makeLoader('first', () => {
          throw new ServerError(401, 'first-error');
        }),
        makeLoader('second', () => {
          throw new ServerError(500, 'second-error');
        })
      );
      const requestEv = runPage(route, exitRender());

      await requestEv.next();

      expect(requestEv.status()).toBe(401);
      expect(requestEv.sharedMap.get(RequestEvHttpStatusMessage)).toBe('first-error');
    });

    it('a failing blockSSR:false loader does not affect the response when unread', async () => {
      const route = pageRouteWithLoaders(
        makeLoader(
          'l1',
          () => {
            throw new ServerError(401, 'boom');
          },
          { blockSSR: false }
        )
      );
      const renderHandler = exitRender();
      const requestEv = runPage(route, renderHandler);

      await expect(requestEv.next()).resolves.toBeUndefined();

      expect(renderHandler).toHaveBeenCalledOnce();
      expect(requestEv.status()).toBe(200);
    });
  });

  describe('action result resolution', () => {
    it('always returns undefined for actions, even when one was submitted', async () => {
      // Loaders must be a pure function of the URL — see route-loader docs and the
      // action-state changeset. resolveValue intentionally hides action state from
      // loaders so MPA inline-render and SPA JSON refetch produce the same result.
      const requestEv = createMockRequestEvent('http://localhost:3000/about/', true);
      const actionA = { __brand: 'server_action', __id: 'action-a' };
      const actionB = { __brand: 'server_action', __id: 'action-b' };

      requestEv.sharedMap.set(RequestEvSharedActionId, 'action-a');
      requestEv.sharedMap.set('@actionResult', { ok: true });

      await expect(requestEv.resolveValue(actionA as any)).resolves.toBeUndefined();
      await expect(requestEv.resolveValue(actionB as any)).resolves.toBeUndefined();
    });
  });

  describe('streamServerFunctionResult', () => {
    // A writable in the post-disconnect state: write/close reject (as Bun's does).
    function makeDisconnectedWritable(): WritableStream<Uint8Array> {
      return new WritableStream<Uint8Array>({
        write() {},
        close() {
          throw new Error('Cannot close a writable stream that is closed or errored');
        },
      });
    }

    function makeStreamingEvent(writable: WritableStream<Uint8Array>): RequestEvent {
      return {
        headers: new Headers(),
        getWritableStream: () => writable,
        signal: new AbortController().signal,
      } as unknown as RequestEvent;
    }

    async function* twoItems(): AsyncGenerator<{ n: number }> {
      yield { n: 0 };
      yield { n: 1 };
    }

    it('does not leak an unhandled rejection when close() rejects on a disconnected client', async () => {
      const fakeQrl = { getHash: () => 'streamServerFn', getSymbol: () => 'streamServerFn' } as any;
      const rejections: unknown[] = [];
      const onUnhandled = (reason: unknown) => rejections.push(reason);
      process.on('unhandledRejection', onUnhandled);
      try {
        const ev = makeStreamingEvent(makeDisconnectedWritable());
        await streamServerFunctionResult(ev, twoItems(), fakeQrl);
        // Let a macrotask elapse so a dropped rejection surfaces before we assert.
        await new Promise((resolve) => setTimeout(resolve, 10));
      } finally {
        process.off('unhandledRejection', onUnhandled);
      }
      expect(rejections).toEqual([]);
    });
  });
});
