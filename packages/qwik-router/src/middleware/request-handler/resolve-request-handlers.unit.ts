import { describe, it, expect, vi } from 'vitest';
import {
  getPathname,
  fixTrailingSlash,
  loadersMiddleware,
  resolveRequestHandlers,
} from './resolve-request-handlers';
import { RequestEvHttpStatusMessage, RequestEvSharedActionId } from './request-event-core';
import { createRequestEvent } from './request-event';
import { RedirectMessage } from './redirect-handler';
import { isContentType } from './request-utils';
import type { ServerRequestEvent } from './types';
import { checkCSRF } from './resolve-request-handlers';
import type { LoadedRoute, LoaderInternal, RouteModule } from '../../runtime/src/types';
import { getRouteLoaderErrors, getRouteLoaderValues } from '../../runtime/src/route-loaders';
import { ServerError } from '@qwik.dev/router/middleware/request-handler';
import { IsQLoader, QLoaderId } from './request-path';

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

      await handlers[2]({
        sharedMap: new Map([
          [IsQLoader, true],
          [QLoaderId, 'layout-loader'],
        ] as any),
      } as any);

      expect(pageOnRequest).not.toHaveBeenCalled();
    });

    it('runs page middleware for a loader exported by that page module', async () => {
      const pageLoader = vi.fn() as any;
      pageLoader.__brand = 'server_loader';
      pageLoader.__id = 'page-loader';
      const pageOnRequest = vi.fn();
      const route: LoadedRoute = {
        $routeName$: '/',
        $params$: {},
        $mods$: [
          {},
          { default: vi.fn(), onRequest: pageOnRequest, usePageData: pageLoader },
        ] as any,
      };

      const handlers = resolveRequestHandlers(undefined, route, 'GET', false, vi.fn());

      await handlers[2]({
        sharedMap: new Map([
          [IsQLoader, true],
          [QLoaderId, 'page-loader'],
        ] as any),
      } as any);

      expect(pageOnRequest).toHaveBeenCalledTimes(1);
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
        $errorLoader$: vi.fn(async () => ({ default: () => null })),
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

  describe('loadersMiddleware multi-loader failure determinism', () => {
    const createLoader = (id: string, fn: (thisArg: unknown, ev: any) => unknown): LoaderInternal =>
      ({
        __brand: 'server_loader',
        __id: id,
        __qrl: {
          call: vi.fn(fn),
          getHash: () => id,
          getSymbol: () => id,
        },
        __validators: undefined,
        __serializationStrategy: 'never',
        __expires: 0,
        __poll: false,
        __eTag: undefined,
        __cacheKey: undefined,
        __search: undefined,
        __allowStale: true,
      }) as any;

    const slowFail = createLoader('slow-fail', async (_thisArg, ev) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return ev.fail(503, { reason: 'slow loader failed' });
    });
    const fastFail = createLoader('fast-fail', (_thisArg, ev) =>
      ev.fail(429, { reason: 'fast loader failed' })
    );
    const okLoader = createLoader('ok-loader', () => ({ result: 'ok' }));

    it('uses the first failed loader in registration order for the response status', async () => {
      const requestEv = createMockRequestEvent('http://localhost:3000/test/', true);
      requestEv.headers.set('Cache-Control', 'max-age=3600');

      await loadersMiddleware([slowFail, fastFail, okLoader], mockRoute)(requestEv);

      expect(requestEv.status()).toBe(503);
      expect(requestEv.headers.get('Cache-Control')).toBeNull();

      const errors = getRouteLoaderErrors(requestEv);
      expect(errors['slow-fail']).toBeInstanceOf(ServerError);
      expect(errors['slow-fail'].status).toBe(503);
      expect(errors['fast-fail']).toBeInstanceOf(ServerError);
      expect(errors['fast-fail'].status).toBe(429);

      const values = getRouteLoaderValues(requestEv);
      expect('slow-fail' in values).toBe(false);
      expect('fast-fail' in values).toBe(false);
      expect(values['ok-loader']).toEqual({ result: 'ok' });
    });

    it('uses the other status when the registration order is reversed', async () => {
      const requestEv = createMockRequestEvent('http://localhost:3000/test/', true);

      await loadersMiddleware([fastFail, slowFail], mockRoute)(requestEv);

      expect(requestEv.status()).toBe(429);
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
});
