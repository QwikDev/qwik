import { _serialize, isDev } from '@qwik.dev/core/internal';
import type {
  LoadedRoute,
  RebuildRouteInfoInternal,
  RequestEvent,
  RequestHandler,
} from '../../runtime/src/types';
import { _asyncRequestStore } from './async-request-store';
import { getErrorHtml } from './error-handler';
import { createRequestEvent, type RequestEventInternal } from './request-event-core';
import { AbortMessage, RedirectMessage } from './redirect-handler';
import { RewriteMessage } from './rewrite-handler';
import { ServerError } from './server-error';
import { encoder } from './request-utils';
import type { ServerRequestEvent, StatusCodes } from './types';

export type QwikRouterCompletion = Error | undefined | object;

export interface QwikRouterRun<T> {
  response: Promise<T | null>;
  requestEv: RequestEvent;
  completion: Promise<QwikRouterCompletion>;
}

const ensureError = (e: unknown) =>
  e instanceof Error || (typeof e === 'object' && e !== null) ? e : new Error(String(e));

export function runQwikRouter<T>(
  serverRequestEv: ServerRequestEvent<T>,
  loadedRoute: LoadedRoute,
  requestHandlers: RequestHandler<any>[],
  rebuildRouteInfo: RebuildRouteInfoInternal,
  basePathname = '/'
): QwikRouterRun<T> {
  let resolve: (value: T | null) => void;
  const responsePromise = new Promise<T | null>((r) => (resolve = r));
  try {
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
      completion: _asyncRequestStore
        ? _asyncRequestStore.run(requestEv, runNext, requestEv, rebuildRouteInfo, resolve!)
        : runNext(requestEv, rebuildRouteInfo, resolve!),
    };
  } catch (e) {
    // Sync error
    resolve!(null);
    return {
      response: responsePromise,
      requestEv: { headersSent: false } as RequestEvent,
      completion: Promise.resolve(ensureError(e)),
    };
  }
}

async function runNext(
  requestEv: RequestEventInternal,
  rebuildRouteInfo: RebuildRouteInfoInternal,
  resolve: (value: any) => void
): Promise<QwikRouterCompletion> {
  try {
    const isValidURL = (url: URL) => new URL(url.pathname + url.search, url);
    isValidURL(requestEv.originalUrl);
  } catch {
    const status = 404;
    const message = 'Resource Not Found';
    requestEv.status(status);
    requestEv.html(status, getErrorHtml(status, message));
    return new ServerError(status, message);
  }

  let rewriteAttempt = 1;

  async function runOnce(): Promise<QwikRouterCompletion> {
    try {
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
        return await runOnce();
      } else if (e instanceof AbortMessage) {
        return;
      } else if (e instanceof ServerError && !requestEv.headersSent) {
        const status = e.status as StatusCodes;
        const accept = requestEv.request.headers.get('Accept');
        if (accept && !accept.includes('text/html')) {
          requestEv.headers.set('Content-Type', 'application/qwik-json');
          requestEv.send(status, await _serialize(e.data));
        } else {
          requestEv.html(status, getErrorHtml(status, e.data));
        }
        return e;
      }
      if (!isDev) {
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

      return e instanceof Error || (typeof e === 'object' && e !== null) ? e : new Error(String(e));
    }
  }

  try {
    return await runOnce();
  } finally {
    if (!requestEv.isDirty()) {
      resolve(null);
    }
  }
}
