import { _serialize } from '@qwik.dev/core/internal';
import type {
  LoadedRoute,
  RebuildRouteInfoInternal,
  RequestEvent,
  RequestHandler,
} from '../../runtime/src/types';
import { getErrorHtml } from './error-handler';
import { createRequestEvent, getRequestMode, type RequestEventInternal } from './request-event';
import { encoder } from './resolve-request-handlers';
import { withLocale } from '@qwik.dev/core';
import type { ServerRequestEvent, StatusCodes } from './types';

// Import separately to avoid duplicate imports in the vite dev server
import {
  AbortMessage,
  RedirectMessage,
  RewriteMessage,
  ServerError,
} from '@qwik.dev/router/middleware/request-handler';
import { qcAsyncRequestStore } from './async-hooks';

export interface QwikRouterRun<T> {
  /**
   * The response to the request, if any. If there is no response, there might have been an error,
   * or the request was aborted.
   */
  response: Promise<T | null>;
  requestEv: RequestEvent;
  /**
   * Promise for the completion of the request.
   *
   * If it returns a RedirectMessage, it means the request must be redirected.
   *
   * If it returns an Error, it means there was an error, and if possible, the response already
   * includes the error. The error is informational only.
   */
  completion: Promise<RedirectMessage | Error | undefined>;
}

export function runQwikRouter<T>(
  serverRequestEv: ServerRequestEvent<T>,
  loadedRoute: LoadedRoute | null,
  requestHandlers: RequestHandler<any>[],
  rebuildRouteInfo: RebuildRouteInfoInternal,
  basePathname = '/'
): QwikRouterRun<T> {
  let resolve: (value: T) => void;
  const responsePromise = new Promise<T>((r) => (resolve = r));
  const requestEv = createRequestEvent(
    serverRequestEv,
    loadedRoute,
    requestHandlers,
    basePathname,
    resolve!
  );

  return {
    response: responsePromise,
    requestEv,
    completion: withLocale(
      requestEv.locale(),
      qcAsyncRequestStore
        ? () => qcAsyncRequestStore!.run(requestEv, runNext, requestEv, rebuildRouteInfo, resolve!)
        : () => runNext(requestEv, rebuildRouteInfo, resolve!)
    ),
  };
}

async function runNext(
  requestEv: RequestEventInternal,
  rebuildRouteInfo: RebuildRouteInfoInternal,
  resolve: (value: any) => void
): Promise<Error | RedirectMessage | undefined> {
  try {
    const isValidURL = (url: URL) => new URL(url.pathname + url.search, url);
    isValidURL(requestEv.originalUrl);
  } catch {
    const status = 404;
    const message = 'Resource Not Found';
    requestEv.status(status);
    const html = getErrorHtml(status, message);
    requestEv.html(status, html);
    return new ServerError(status, message);
  }

  let rewriteAttempt = 1;

  async function _runNext() {
    try {
      // Run all middlewares
      await requestEv.next();
    } catch (e) {
      if (e instanceof RedirectMessage) {
        const stream = requestEv.getWritableStream();
        await stream.close();
        return e;
      } else if (e instanceof RewriteMessage) {
        if (rewriteAttempt > 50) {
          return new Error(`Infinite rewrite loop`);
        }

        rewriteAttempt += 1;
        const url = new URL(requestEv.url);
        url.pathname = e.pathname;
        const { loadedRoute, requestHandlers } = await rebuildRouteInfo(url);
        requestEv.resetRoute(loadedRoute, requestHandlers, url);
        return await _runNext();
      } else if (e instanceof AbortMessage) {
        return;
      } else if (e instanceof ServerError && !requestEv.headersSent) {
        const status = e.status as StatusCodes;
        const accept = requestEv.request.headers.get('Accept');
        if (accept && !accept.includes('text/html')) {
          requestEv.headers.set('Content-Type', 'application/qwik-json');
          requestEv.send(status, await _serialize([e.data]));
        } else {
          // TODO render the custom error route
          requestEv.html(status, getErrorHtml(status, e.data));
        }
        return e;
      }
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

      return e as Error;
    }
  }

  try {
    return await _runNext();
  } finally {
    if (!requestEv.isDirty()) {
      // The request didn't get handled, so we need to resolve with null.
      resolve(null);
    }
  }
}

/**
 * The pathname used to match in the route regex array. A pathname ending with /q-data.json should
 * be treated as a pathname without it.
 */
export function getRouteMatchPathname(pathname: string) {
  const isInternal = pathname.endsWith(QDATA_JSON);
  if (isInternal) {
    const trimEnd =
      pathname.length - QDATA_JSON.length + (globalThis.__NO_TRAILING_SLASH__ ? 0 : 1);
    pathname = pathname.slice(0, trimEnd);
    if (pathname === '') {
      pathname = '/';
    }
  }
  return { pathname, isInternal };
}

export const IsQData = '@isQData';
export const QDATA_JSON = '/q-data.json';
