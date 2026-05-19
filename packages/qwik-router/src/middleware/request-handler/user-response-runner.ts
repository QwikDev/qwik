import { _serialize, isDev } from '@qwik.dev/core/internal';
import type { AsyncLocalStorage } from 'node:async_hooks';
import type {
  LoadedRoute,
  RebuildRouteInfoInternal,
  RequestEvent,
  RequestHandler,
} from '../../runtime/src/types';
import type { ServerRequestEvent, StatusCodes } from './types';

export type QwikRouterCompletion = Error | undefined | object;

export interface QwikRouterRun<T> {
  response: Promise<T | null>;
  requestEv: RequestEvent;
  completion: Promise<QwikRouterCompletion>;
}

type RedirectMessageConstructor = new (...args: any[]) => object;
type AbortMessageConstructor = new (...args: any[]) => object;
type RewriteMessageConstructor = new (...args: any[]) => { pathname: string };
type ServerErrorConstructor = new (...args: any[]) => { status: StatusCodes; data: unknown };

interface RequestEventInternalLike extends Readonly<RequestEvent> {
  readonly originalUrl: URL;
  readonly request: Request;
  readonly headers: Headers;
  readonly headersSent: boolean;
  readonly url: URL;
  next(): Promise<void>;
  getWritableStream(): WritableStream<Uint8Array>;
  resetRoute(
    loadedRoute: LoadedRoute | null,
    requestHandlers: RequestHandler<any>[],
    url: URL
  ): void;
  isDirty(): boolean;
}

interface UserResponseDeps<TRequestEventInternal extends RequestEventInternalLike> {
  AbortMessage: AbortMessageConstructor;
  RedirectMessage: RedirectMessageConstructor;
  RewriteMessage: RewriteMessageConstructor;
  ServerError: ServerErrorConstructor;
  asyncRequestStore: AsyncLocalStorage<RequestEventInternalLike> | undefined;
  createRequestEvent: (
    serverRequestEv: ServerRequestEvent,
    loadedRoute: LoadedRoute,
    requestHandlers: RequestHandler<any>[],
    basePathname: string,
    resolved: (response: any) => void
  ) => TRequestEventInternal;
  encoder: TextEncoder;
  getErrorHtml: (status: number, message: unknown) => string;
}

export function runQwikRouterWithDeps<T, TRequestEventInternal extends RequestEventInternalLike>(
  serverRequestEv: ServerRequestEvent<T>,
  loadedRoute: LoadedRoute,
  requestHandlers: RequestHandler<any>[],
  rebuildRouteInfo: RebuildRouteInfoInternal,
  basePathname: string,
  deps: UserResponseDeps<TRequestEventInternal>
): QwikRouterRun<T> {
  let resolve: (value: T | null) => void;
  const responsePromise = new Promise<T | null>((r) => (resolve = r));
  const requestEv = deps.createRequestEvent(
    serverRequestEv,
    loadedRoute,
    requestHandlers,
    basePathname,
    resolve!
  );

  return {
    response: responsePromise,
    requestEv,
    completion: deps.asyncRequestStore
      ? deps.asyncRequestStore.run(
          requestEv,
          runNextWithDeps,
          requestEv,
          rebuildRouteInfo,
          resolve!,
          deps
        )
      : runNextWithDeps(requestEv, rebuildRouteInfo, resolve!, deps),
  };
}

async function runNextWithDeps<TRequestEventInternal extends RequestEventInternalLike>(
  requestEv: TRequestEventInternal,
  rebuildRouteInfo: RebuildRouteInfoInternal,
  resolve: (value: any) => void,
  deps: UserResponseDeps<TRequestEventInternal>
): Promise<QwikRouterCompletion> {
  try {
    const isValidURL = (url: URL) => new URL(url.pathname + url.search, url);
    isValidURL(requestEv.originalUrl);
  } catch {
    const status = 404;
    const message = 'Resource Not Found';
    requestEv.status(status);
    requestEv.html(status, deps.getErrorHtml(status, message));
    return new deps.ServerError(status, message);
  }

  let rewriteAttempt = 1;

  async function runOnce(): Promise<QwikRouterCompletion> {
    try {
      await requestEv.next();
    } catch (e) {
      if (e instanceof deps.RedirectMessage) {
        const stream = requestEv.getWritableStream();
        await stream.close();
        return e;
      } else if (e instanceof deps.RewriteMessage) {
        if (rewriteAttempt > 50) {
          return new Error(`Infinite rewrite loop`);
        }

        rewriteAttempt += 1;
        const url = new URL(requestEv.url);
        url.pathname = e.pathname;
        const { loadedRoute, requestHandlers } = await rebuildRouteInfo(url);
        requestEv.resetRoute(loadedRoute, requestHandlers, url);
        return await runOnce();
      } else if (e instanceof deps.AbortMessage) {
        return;
      } else if (e instanceof deps.ServerError && !requestEv.headersSent) {
        const status = e.status as StatusCodes;
        const accept = requestEv.request.headers.get('Accept');
        if (accept && !accept.includes('text/html')) {
          requestEv.headers.set('Content-Type', 'application/qwik-json');
          requestEv.send(status, await _serialize(e.data));
        } else {
          requestEv.html(status, deps.getErrorHtml(status, e.data));
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
            await writer.write(
              deps.encoder.encode(deps.getErrorHtml(500, 'Internal Server Error'))
            );
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
