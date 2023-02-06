import type {
  RequestEvent,
  RequestEventLoader,
  ServerRequestEvent,
  ServerRequestMode,
  RequestHandler,
  RequestEventCommon,
  GetData,
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
const RequestEvStatus = Symbol('RequestEvStatus');
const RequestEvRoute = Symbol('RequestEvRoute');
export const RequestEvAction = Symbol('RequestEvAction');
export const RequestEvTrailingSlash = Symbol('RequestEvTrailingSlash');
export const RequestEvBasePathname = Symbol('RequestEvBasePathname');

export function createRequestEvent(
  serverRequestEv: ServerRequestEvent,
  loadedRoute: LoadedRoute | null,
  requestHandlers: RequestHandler<unknown>[],
  trailingSlash = true,
  basePathname = '/',
  resolved: (response: any) => void
) {
  const { request, platform, env } = serverRequestEv;

  const cookie = new Cookie(request.headers.get('cookie'));
  const headers = new Headers();
  const url = new URL(request.url);

  let routeModuleIndex = -1;
  let writableStream: WritableStream<Uint8Array> | null = null;

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
      requestEv[RequestEvStatus] = statusOrResponse;
      const writableStream = requestEv.getWritableStream();
      const writer = writableStream.getWriter();
      writer.write(typeof body === 'string' ? encoder.encode(body) : body);
      writer.close();
    } else {
      const status = statusOrResponse.status;
      requestEv[RequestEvStatus] = status;
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
    [RequestEvStatus]: 200,
    [RequestEvAction]: undefined,
    [RequestEvTrailingSlash]: trailingSlash,
    [RequestEvBasePathname]: basePathname,
    [RequestEvRoute]: loadedRoute,
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

    getData: (async (loaderOrAction: LoaderInternal | ActionInternal) => {
      // create user request event, which is a narrowed down request context
      const id = loaderOrAction.__qrl.getHash();
      if (loaderOrAction.__brand === 'server_loader') {
        if (!(id in loaders)) {
          throw new Error(
            'You can not get the returned data of a loader that has not been executed for this request.'
          );
        }
      }

      return loaders[id];
    }) as GetData,

    status: (statusCode?: number) => {
      if (typeof statusCode === 'number') {
        check();
        requestEv[RequestEvStatus] = statusCode;
        return statusCode;
      }
      return requestEv[RequestEvStatus];
    },

    locale: (locale?: string) => {
      if (typeof locale === 'string') {
        requestEv[RequestEvLocale] = locale;
      }
      return requestEv[RequestEvLocale] || '';
    },

    error: (statusCode: number, message: string) => {
      requestEv[RequestEvStatus] = statusCode;
      headers.delete('Cache-Control');
      return new ErrorResponse(statusCode, message);
    },

    redirect: (statusCode: number, url: string) => {
      check();
      requestEv[RequestEvStatus] = statusCode;
      headers.set('Location', url);
      headers.delete('Cache-Control');
      if (statusCode > 301) {
        headers.set('Cache-Control', 'no-store');
      }
      return new RedirectMessage();
    },

    fail: <T extends Record<string, any>>(statusCode: number, data: T) => {
      check();
      requestEv[RequestEvStatus] = statusCode;
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

    getWritableStream: () => {
      if (writableStream === null) {
        writableStream = serverRequestEv.getWritableStream(
          requestEv[RequestEvStatus],
          headers,
          cookie,
          resolved,
          requestEv
        );
      }
      return writableStream;
    },
  };
  return requestEv;
}

export interface RequestEventInternal extends RequestEvent, RequestEventLoader {
  [RequestEvLoaders]: Record<string, Promise<any>>;
  [RequestEvLocale]: string | undefined;
  [RequestEvMode]: ServerRequestMode;
  [RequestEvStatus]: number;
  [RequestEvAction]: string | undefined;
  [RequestEvTrailingSlash]: boolean;
  [RequestEvBasePathname]: string;
  [RequestEvRoute]: LoadedRoute | null;
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
export function getRequestAction(requestEv: RequestEventCommon) {
  return (requestEv as RequestEventInternal)[RequestEvAction];
}

export function setRequestAction(requestEv: RequestEventCommon, id: string) {
  (requestEv as RequestEventInternal)[RequestEvAction] = id;
}

export function getRequestMode(requestEv: RequestEventCommon) {
  return (requestEv as RequestEventInternal)[RequestEvMode];
}

const ABORT_INDEX = 999999999;
