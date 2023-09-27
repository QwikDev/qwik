import type {
  RequestEvent,
  RequestEventLoader,
  ServerRequestEvent,
  ServerRequestMode,
  RequestHandler,
  RequestEventCommon,
  ResolveValue,
  QwikSerializer,
  CacheControlTarget,
  CacheControl,
} from './types';
import type {
  ActionInternal,
  JSONValue,
  LoadedRoute,
  LoaderInternal,
  FailReturn,
} from '../../runtime/src/types';
import { Cookie } from './cookie';
import { ErrorResponse } from './error-handler';
import { AbortMessage, RedirectMessage } from './redirect-handler';
import { encoder } from './resolve-request-handlers';
import { createCacheControl } from './cache-control';
import type { ValueOrPromise } from '@builder.io/qwik';
import type { QwikManifest, ResolvedManifest } from '@builder.io/qwik/optimizer';
import { IsQData, QDATA_JSON, QDATA_JSON_LEN } from './user-response';
import { isPromise } from './../../runtime/src/utils';

const RequestEvLoaders = Symbol('RequestEvLoaders');
const RequestEvMode = Symbol('RequestEvMode');
const RequestEvRoute = Symbol('RequestEvRoute');
export const RequestEvQwikSerializer = Symbol('RequestEvQwikSerializer');
export const RequestEvTrailingSlash = Symbol('RequestEvTrailingSlash');
export const RequestRouteName = '@routeName';
export const RequestEvSharedActionId = '@actionId';
export const RequestEvSharedActionFormData = '@actionFormData';
export const RequestEvSharedNonce = '@nonce';

export function createRequestEvent(
  serverRequestEv: ServerRequestEvent,
  loadedRoute: LoadedRoute | null,
  requestHandlers: RequestHandler<any>[],
  manifest: QwikManifest | ResolvedManifest | undefined,
  trailingSlash: boolean,
  basePathname: string,
  qwikSerializer: QwikSerializer,
  resolved: (response: any) => void
) {
  const { request, platform, env } = serverRequestEv;

  const sharedMap = new Map();
  const cookie = new Cookie(request.headers.get('cookie'));
  const headers = new Headers();
  const url = new URL(request.url);
  if (url.pathname.endsWith(QDATA_JSON)) {
    url.pathname = url.pathname.slice(0, -QDATA_JSON_LEN);
    if (trailingSlash && !url.pathname.endsWith('/')) {
      url.pathname += '/';
    }
    sharedMap.set(IsQData, true);
  }
  sharedMap.set('@manifest', manifest);

  let routeModuleIndex = -1;
  let writableStream: WritableStream<Uint8Array> | null = null;
  let requestData: Promise<JSONValue | undefined> | undefined = undefined;
  let locale = serverRequestEv.locale;
  let status = 200;

  const next = async () => {
    routeModuleIndex++;

    while (routeModuleIndex < requestHandlers.length) {
      const moduleRequestHandler = requestHandlers[routeModuleIndex];
      const result = moduleRequestHandler(requestEv);
      if (isPromise(result)) {
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
    return exit();
  };

  const exit = () => {
    routeModuleIndex = ABORT_INDEX;
    return new AbortMessage();
  };

  const loaders: Record<string, Promise<any>> = {};
  const requestEv: RequestEventInternal = {
    [RequestEvLoaders]: loaders,
    [RequestEvMode]: serverRequestEv.mode,
    [RequestEvTrailingSlash]: trailingSlash,
    [RequestEvRoute]: loadedRoute,
    [RequestEvQwikSerializer]: qwikSerializer,
    cookie,
    headers,
    env,
    method: request.method,
    signal: request.signal,
    params: loadedRoute?.[1] ?? {},
    pathname: url.pathname,
    platform,
    query: url.searchParams,
    request,
    url,
    basePathname,
    sharedMap,
    get headersSent() {
      return writableStream !== null;
    },
    get exited() {
      return routeModuleIndex >= ABORT_INDEX;
    },
    get clientConn() {
      return serverRequestEv.getClientConn();
    },

    next,

    exit,

    cacheControl: (cacheControl: CacheControl, target: CacheControlTarget = 'Cache-Control') => {
      check();
      headers.set(target, createCacheControl(cacheControl));
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

    locale: (_locale?: string) => {
      if (typeof _locale === 'string') {
        locale = _locale;
      }
      return locale || '';
    },

    error: (statusCode: number, message: string) => {
      status = statusCode;
      headers.delete('Cache-Control');
      return new ErrorResponse(statusCode, message);
    },

    redirect: (statusCode: number, url: string) => {
      check();
      status = statusCode;
      if (url) {
        const fixedURL = url.replace(/([^:])\/{2,}/g, '$1/');
        if (url !== fixedURL) {
          console.warn(`Redirect URL ${url} is invalid, fixing to ${fixedURL}`);
        }
        headers.set('Location', fixedURL);
      }
      headers.delete('Cache-Control');
      if (statusCode > 301) {
        headers.set('Cache-Control', 'no-store');
      }
      exit();
      return new RedirectMessage();
    },

    defer: (returnData) => {
      return typeof returnData === 'function' ? returnData : () => returnData;
    },

    fail: <T extends Record<string, any>>(statusCode: number, data: T): FailReturn<T> => {
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

    parseBody: async () => {
      if (requestData !== undefined) {
        return requestData;
      }
      return (requestData = parseRequest(requestEv.request, sharedMap, qwikSerializer));
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
        if (serverRequestEv.mode === 'dev') {
          const serverTiming = sharedMap.get('@serverTiming') as [string, number][] | undefined;
          if (serverTiming) {
            headers.set('Server-Timing', serverTiming.map((a) => `${a[0]};dur=${a[1]}`).join(','));
          }
        }
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
  [RequestEvLoaders]: Record<string, ValueOrPromise<unknown> | undefined>;
  [RequestEvMode]: ServerRequestMode;
  [RequestEvTrailingSlash]: boolean;
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

export function getRequestRoute(requestEv: RequestEventCommon) {
  return (requestEv as RequestEventInternal)[RequestEvRoute];
}

export function getRequestMode(requestEv: RequestEventCommon) {
  return (requestEv as RequestEventInternal)[RequestEvMode];
}

const ABORT_INDEX = Number.MAX_SAFE_INTEGER;

const parseRequest = async (
  request: Request,
  sharedMap: Map<string, any>,
  qwikSerializer: QwikSerializer
): Promise<JSONValue | undefined> => {
  const req = request.clone();
  const type = request.headers.get('content-type')?.split(/[;,]/, 1)[0].trim() ?? '';
  if (type === 'application/x-www-form-urlencoded' || type === 'multipart/form-data') {
    const formData = await req.formData();
    sharedMap.set(RequestEvSharedActionFormData, formData);
    return formToObj(formData);
  } else if (type === 'application/json') {
    const data = await req.json();
    return data;
  } else if (type === 'application/qwik-json') {
    return qwikSerializer._deserializeData(await req.text());
  }
  return undefined;
};

const formToObj = (formData: FormData): Record<string, any> => {
  /**
   * Convert FormData to object
   * Handle nested form input using dot notation
   * Handle array input using indexed dot notation (name.0, name.0) or bracket notation (name[]),
   * the later is needed for multiselects
   * Create values object by form data entries
   */
  const values = [...formData.entries()].reduce<any>((values, [name, value]) => {
    name.split('.').reduce((object: any, key: string, index: number, keys: any) => {
      // Backet notation for arrays, notibly for multi selects
      if (key.endsWith('[]')) {
        const arrayKey = key.slice(0, -2);
        object[arrayKey] = object[arrayKey] || [];
        return (object[arrayKey] = [...object[arrayKey], value]);
      }

      // If it is not last index, return nested object or array
      if (index < keys.length - 1) {
        return (object[key] = object[key] || (Number.isNaN(+keys[index + 1]) ? {} : []));
      }

      return (object[key] = value);
    }, values);

    // Return modified values
    return values;
  }, {});

  // Return values object
  return values;
};
