import type {
  RequestEvent,
  RequestEventLoader,
  ServerRequestEvent,
  ServerRequestMode,
  RequestHandler,
  RequestEventCommon,
  ResolveValue,
  QwikSerializer,
} from './types';
import type { ActionInternal, LoadedRoute, LoaderInternal } from '../../runtime/src/types';
import { Cookie } from './cookie';
import { ErrorResponse } from './error-handler';
import { AbortMessage, RedirectMessage } from './redirect-handler';
import { encoder } from './resolve-request-handlers';
import { createCacheControl } from './cache-control';

const RequestEvLoaders = Symbol('RequestEvLoaders');
const RequestEvLocale = Symbol('RequestEvLocale');
const RequestEvMode = Symbol('RequestEvMode');
const RequestEvRoute = Symbol('RequestEvRoute');
export const RequestEvQwikSerializer = Symbol('RequestEvQwikSerializer');
export const RequestEvTrailingSlash = Symbol('RequestEvTrailingSlash');
export const RequestEvBasePathname = Symbol('RequestEvBasePathname');
export const RequestEvSharedActionId = '@actionId';
export const RequestEvSharedActionFormData = '@actionFormData';
export const RequestEvSharedNonce = '@nonce';

export function createRequestEvent(
  serverRequestEv: ServerRequestEvent,
  loadedRoute: LoadedRoute | null,
  requestHandlers: RequestHandler<any>[],
  trailingSlash = true,
  basePathname = '/',
  qwikSerializer: QwikSerializer,
  resolved: (response: any) => void
) {
  const { request, platform, env } = serverRequestEv;

  const cookie = new Cookie(request.headers.get('cookie'));
  const headers = new Headers();
  const url = new URL(request.url);

  let routeModuleIndex = -1;
  let writableStream: WritableStream<Uint8Array> | null = null;
  let status = 200;

  const next = async () => {
    routeModuleIndex++;

    while (routeModuleIndex < requestHandlers.length) {
      const moduleRequestHandler = requestHandlers[routeModuleIndex];
      const result = moduleRequestHandler(requestEv);
      if (result instanceof Promise) {
        await result;
      }
      routeModuleIndex++;
    }
  };

  const check = () => {
    if (writableStream !== null) {
      throw new Error('Response already sent');
    }
  };

  const send = (statusOrResponse: number | Response, body: string | Uint8Array) => {
    check();
    if (typeof statusOrResponse === 'number') {
      status = statusOrResponse;
      const writableStream = requestEv.getWritableStream();
      const writer = writableStream.getWriter();
      writer.write(typeof body === 'string' ? encoder.encode(body) : body);
      writer.close();
    } else {
      status = statusOrResponse.status;
      statusOrResponse.headers.forEach((value, key) => {
        headers.append(key, value);
      });
      if (statusOrResponse.body) {
        const writableStream = requestEv.getWritableStream();
        statusOrResponse.body.pipeTo(writableStream);
      } else {
        if (status >= 300 && status < 400) {
          return new RedirectMessage();
        } else {
          requestEv.getWritableStream().getWriter().close();
        }
      }
    }
    return new AbortMessage();
  };

  const loaders: Record<string, Promise<any>> = {};

  const requestEv: RequestEventInternal = {
    [RequestEvLoaders]: loaders,
    [RequestEvLocale]: serverRequestEv.locale,
    [RequestEvMode]: serverRequestEv.mode,
    [RequestEvTrailingSlash]: trailingSlash,
    [RequestEvBasePathname]: basePathname,
    [RequestEvRoute]: loadedRoute,
    [RequestEvQwikSerializer]: qwikSerializer,
    cookie,
    headers,
    env,
    method: request.method,
    params: loadedRoute?.[0] ?? {},
    pathname: url.pathname,
    platform,
    query: url.searchParams,
    request,
    url,
    sharedMap: new Map(),
    get headersSent() {
      return writableStream !== null;
    },
    get exited() {
      return routeModuleIndex >= ABORT_INDEX;
    },

    next,

    exit: () => {
      routeModuleIndex = ABORT_INDEX;
      return new AbortMessage();
    },

    cacheControl: (cacheControl) => {
      check();
      headers.set('Cache-Control', createCacheControl(cacheControl));
    },

    resolveValue: (async (loaderOrAction: LoaderInternal | ActionInternal) => {
      // create user request event, which is a narrowed down request context
      const id = loaderOrAction.__id;
      if (loaderOrAction.__brand === 'server_loader') {
        if (!(id in loaders)) {
          throw new Error(
            'You can not get the returned data of a loader that has not been executed for this request.'
          );
        }
      }

      return loaders[id];
    }) as ResolveValue,

    status: (statusCode?: number) => {
      if (typeof statusCode === 'number') {
        check();
        status = statusCode;
        return statusCode;
      }
      return status;
    },

    locale: (locale?: string) => {
      if (typeof locale === 'string') {
        requestEv[RequestEvLocale] = locale;
      }
      return requestEv[RequestEvLocale] || '';
    },

    error: (statusCode: number, message: string) => {
      status = statusCode;
      headers.delete('Cache-Control');
      return new ErrorResponse(statusCode, message);
    },

    redirect: (statusCode: number, url: string) => {
      check();
      status = statusCode;
      headers.set('Location', url);
      headers.delete('Cache-Control');
      if (statusCode > 301) {
        headers.set('Cache-Control', 'no-store');
      }
      return new RedirectMessage();
    },

    defer: (returnData) => {
      return typeof returnData === 'function' ? returnData : () => returnData;
    },

    fail: <T extends Record<string, any>>(statusCode: number, data: T) => {
      check();
      status = statusCode;
      headers.delete('Cache-Control');
      return {
        failed: true,
        ...data,
      };
    },

    text: (statusCode: number, text: string) => {
      headers.set('Content-Type', 'text/plain; charset=utf-8');
      return send(statusCode, text);
    },

    html: (statusCode: number, html: string) => {
      headers.set('Content-Type', 'text/html; charset=utf-8');
      return send(statusCode, html);
    },

    json: (statusCode: number, data: any) => {
      headers.set('Content-Type', 'application/json; charset=utf-8');
      return send(statusCode, JSON.stringify(data));
    },

    send: send as any,

    isDirty: () => {
      return writableStream !== null;
    },

    getWritableStream: () => {
      if (writableStream === null) {
        writableStream = serverRequestEv.getWritableStream(
          status,
          headers,
          cookie,
          resolved,
          requestEv
        );
      }
      return writableStream;
    },
  };
  return Object.freeze(requestEv);
}

export interface RequestEventInternal extends RequestEvent, RequestEventLoader {
  [RequestEvLoaders]: Record<string, Promise<any> | undefined>;
  [RequestEvLocale]: string | undefined;
  [RequestEvMode]: ServerRequestMode;
  [RequestEvTrailingSlash]: boolean;
  [RequestEvBasePathname]: string;
  [RequestEvRoute]: LoadedRoute | null;
  [RequestEvQwikSerializer]: QwikSerializer;

  /**
   * Check if this request is already written to.
   *
   * @returns true, if `getWritableStream()` has already been called.
   */
  isDirty(): boolean;
}

export function getRequestLoaders(requestEv: RequestEventCommon) {
  return (requestEv as RequestEventInternal)[RequestEvLoaders];
}

export function getRequestTrailingSlash(requestEv: RequestEventCommon) {
  return (requestEv as RequestEventInternal)[RequestEvTrailingSlash];
}

export function getRequestBasePathname(requestEv: RequestEventCommon) {
  return (requestEv as RequestEventInternal)[RequestEvBasePathname];
}

export function getRequestRoute(requestEv: RequestEventCommon) {
  return (requestEv as RequestEventInternal)[RequestEvRoute];
}

export function getRequestMode(requestEv: RequestEventCommon) {
  return (requestEv as RequestEventInternal)[RequestEvMode];
}

const ABORT_INDEX = 999999999;
