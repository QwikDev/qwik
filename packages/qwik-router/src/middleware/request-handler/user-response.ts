import type {
  LoadedRoute,
  RebuildRouteInfoInternal,
  RequestEvent,
  RequestHandler,
} from '../../runtime/src/types';
import { getErrorHtml } from './error-handler';
import {
  RequestEvQwikSerializer,
  createRequestEvent,
  getRequestMode,
  type RequestEventInternal,
} from './request-event';
import { encoder } from './resolve-request-handlers';
import type { QwikSerializer, ServerRequestEvent, StatusCodes } from './types';
import { withLocale } from '@qwik.dev/core';
import { setAsyncRequestStore, asyncRequestStore } from './async-request-store';
// Import separately to avoid duplicate imports in the vite dev server
import {
  AbortMessage,
  RedirectMessage,
  ServerError,
  RewriteMessage,
} from '@qwik.dev/router/middleware/request-handler';

export interface QwikRouterRun<T> {
  response: Promise<T | null>;
  requestEv: RequestEvent;
  completion: Promise<unknown>;
}

import('node:async_hooks')
  .then((module) => {
    const AsyncLocalStorage = module.AsyncLocalStorage;
    const asyncStore = new AsyncLocalStorage<RequestEventInternal>();
    setAsyncRequestStore(asyncStore);
  })
  .catch((err) => {
    console.warn(
      'AsyncLocalStorage not available, continuing without it. This might impact concurrent server calls.',
      err
    );
  });

export function runQwikRouter<T>(
  serverRequestEv: ServerRequestEvent<T>,
  loadedRoute: LoadedRoute | null,
  requestHandlers: RequestHandler<any>[],
  rebuildRouteInfo: RebuildRouteInfoInternal,
  basePathname = '/',
  qwikSerializer: QwikSerializer
): QwikRouterRun<T> {
  let resolve: (value: T) => void;
  const responsePromise = new Promise<T>((r) => (resolve = r));
  const requestEv = createRequestEvent(
    serverRequestEv,
    loadedRoute,
    requestHandlers,
    basePathname,
    qwikSerializer,
    resolve!
  );

  return {
    response: responsePromise,
    requestEv,
    completion: withLocale(
      requestEv.locale(),
      asyncRequestStore
        ? () => asyncRequestStore!.run(requestEv, runNext, requestEv, rebuildRouteInfo, resolve!)
        : () => runNext(requestEv, rebuildRouteInfo, resolve!)
    ),
  };
}

async function runNext(
  requestEv: RequestEventInternal,
  rebuildRouteInfo: RebuildRouteInfoInternal,
  resolve: (value: any) => void
) {
  let rewriteAttempt = 1;

  async function _runNext() {
    try {
      // Run all middlewares
      await requestEv.next();
    } catch (e) {
      if (e instanceof RedirectMessage) {
        const stream = requestEv.getWritableStream();
        await stream.close();
      } else if (e instanceof RewriteMessage) {
        if (rewriteAttempt > 50) {
          throw new Error(`Infinite rewrite loop`);
        }

        rewriteAttempt += 1;
        const url = new URL(requestEv.url);
        url.pathname = e.pathname;
        const { loadedRoute, requestHandlers } = await rebuildRouteInfo(url);
        requestEv.resetRoute(loadedRoute, requestHandlers, url);
        return await _runNext();
      } else if (e instanceof ServerError) {
        if (!requestEv.headersSent) {
          const status = e.status as StatusCodes;
          const accept = requestEv.request.headers.get('Accept');
          if (accept && !accept.includes('text/html')) {
            const qwikSerializer = requestEv[RequestEvQwikSerializer];
            requestEv.headers.set('Content-Type', 'application/qwik-json');
            requestEv.send(status, await qwikSerializer._serialize([e.data]));
          } else {
            const html = getErrorHtml(e.status, e.data);
            requestEv.html(status, html);
          }
        }
      } else if (!(e instanceof AbortMessage)) {
        if (getRequestMode(requestEv) !== 'dev') {
          try {
            if (!requestEv.headersSent) {
              requestEv.headers.set('content-type', 'text/html; charset=utf-8');
              requestEv.cacheControl({ noCache: true });
              requestEv.status(500);
            }
            const stream = requestEv.getWritableStream();
            if (!stream.locked) {
              const writer = stream.getWriter();
              await writer.write(encoder.encode(getErrorHtml(500, 'Internal Server Error')));
              await writer.close();
            }
          } catch {
            console.error('Unable to render error page');
          }
        }

        return e;
      }
    }

    return undefined;
  }

  try {
    return await _runNext();
  } finally {
    if (!requestEv.isDirty()) {
      resolve(null);
    }
  }
}

/**
 * The pathname used to match in the route regex array. A pathname ending with /q-data.json should
 * be treated as a pathname without it.
 */
export function getRouteMatchPathname(pathname: string) {
  if (pathname.endsWith(QDATA_JSON)) {
    const trimEnd = pathname.length - QDATA_JSON_LEN + (globalThis.__NO_TRAILING_SLASH__ ? 0 : 1);
    pathname = pathname.slice(0, trimEnd);
    if (pathname === '') {
      pathname = '/';
    }
  }
  return pathname;
}

export const IsQData = '@isQData';
export const QDATA_JSON = '/q-data.json';
export const QDATA_JSON_LEN = QDATA_JSON.length;
