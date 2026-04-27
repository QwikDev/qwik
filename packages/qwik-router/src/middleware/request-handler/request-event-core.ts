import type { ValueOrPromise } from '@qwik.dev/core';
import {
  _deserialize,
  _UNINITIALIZED,
  isDev,
  type SerializationStrategy,
} from '@qwik.dev/core/internal';
import type {
  ActionInternal,
  FailReturn,
  JSONValue,
  LoadedRoute,
  LoaderInternal,
} from '../../runtime/src/types';
import type { AbortMessage, RedirectMessage } from './redirect-handler';
import type { RewriteMessage } from './rewrite-handler';
import type { ServerError } from './server-error';
import type {
  CacheControl,
  CacheControlTarget,
  Cookie as RequestCookie,
  RequestEvent,
  RequestEventCommon,
  RequestEventLoader,
  RequestHandler,
  ResolveValue,
  ServerRequestEvent,
  ServerRequestMode,
} from './types';

interface RequestEventDeps {
  QDATA_KEY: string;
  isPromise: (value: unknown) => value is Promise<unknown>;
  createCacheControl: (cacheControl: CacheControl) => string;
  Cookie: new (cookie?: string | null) => RequestCookie;
  AbortMessage: new () => AbortMessage;
  RedirectMessage: new () => RedirectMessage;
  RewriteMessage: new (pathname: string) => RewriteMessage;
  ServerError: new <T = any>(status: number, data: T) => ServerError<T>;
  getRouteLoaderPromise: typeof import('./request-loader').getRouteLoaderPromise;
  getRouteMatchPathname: typeof import('./request-path').getRouteMatchPathname;
  IsQData: string;
  encoder: TextEncoder;
  getContentType: typeof import('./request-utils').getContentType;
}

const RequestEvLoaders = Symbol('RequestEvLoaders');
const RequestEvMode = Symbol('RequestEvMode');
const RequestEvRoute = Symbol('RequestEvRoute');
export const RequestEvLoaderSerializationStrategyMap = Symbol(
  'RequestEvLoaderSerializationStrategyMap'
);
export const RequestRouteName = '@routeName';
export const RequestEvSharedActionId = '@actionId';
export const RequestEvSharedActionFormData = '@actionFormData';
export const RequestEvSharedNonce = '@nonce';
export const RequestEvIsRewrite = '@rewrite';
export const RequestEvShareServerTiming = '@serverTiming';
export const RequestEvETagCacheKey = '@eTagCacheKey';
export const RequestEvHttpStatusMessage = '@httpStatusMessage';
/** @internal */
export const RequestEvShareQData = 'qData';

export function createRequestEventWithDeps(
  deps: RequestEventDeps,
  serverRequestEv: ServerRequestEvent,
  loadedRoute: LoadedRoute,
  requestHandlers: RequestHandler<any>[],
  basePathname: string,
  resolved: (response: any) => void
) {
  const { request, platform, env } = serverRequestEv;

  const sharedMap = new Map();
  const cookie = new deps.Cookie(request.headers.get('cookie'));
  const headers = new Headers();
  const url = new URL(request.url);
  const { pathname, isInternal } = deps.getRouteMatchPathname(url.pathname);
  if (isInternal) {
    // For the middleware callbacks we pretend it's a regular request
    url.pathname = pathname;
    // But we set this flag so that they can act differently
    sharedMap.set(deps.IsQData, true);
  }

  let routeModuleIndex = -1;
  let writableStream: WritableStream<Uint8Array> | null = null;
  let requestData: Promise<JSONValue | undefined> | undefined = undefined;
  let locale = serverRequestEv.locale;
  let status = loadedRoute?.$notFound$ ? 404 : 200;

  const next = async () => {
    routeModuleIndex++;

    while (routeModuleIndex < requestHandlers.length) {
      const moduleRequestHandler = requestHandlers[routeModuleIndex];
      const result = moduleRequestHandler(requestEv);
      if (deps.isPromise(result)) {
        await result;
      }
      routeModuleIndex++;
    }
  };

  const resetRoute = (
    _loadedRoute: LoadedRoute,
    _requestHandlers: RequestHandler<any>[],
    _url = url
  ) => {
    loadedRoute = _loadedRoute;
    status = loadedRoute?.$notFound$ ? 404 : 200;
    requestHandlers = _requestHandlers;
    url.pathname = _url.pathname;
    url.search = _url.search;
    routeModuleIndex = -1;
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
      writer.write(typeof body === 'string' ? deps.encoder.encode(body) : body);
      writer.close();
    } else {
      status = statusOrResponse.status;
      statusOrResponse.headers.forEach((value, key) => {
        if (key.toLowerCase() === 'set-cookie') {
          return;
        }
        headers.append(key, value);
      });
      statusOrResponse.headers.getSetCookie().forEach((ck) => {
        const index = ck.indexOf('=');
        if (index === -1) {
          return;
        }
        const key = ck.slice(0, index).trim();
        const value = ck.slice(index + 1).trim();
        cookie.set(key, value);
      });
      if (statusOrResponse.body) {
        const writableStream = requestEv.getWritableStream();
        statusOrResponse.body.pipeTo(writableStream);
      } else {
        requestEv.getWritableStream().getWriter().close();
      }
    }
    return exit();
  };

  const exit = <T extends AbortMessage | RedirectMessage | RewriteMessage>(
    message: T = new deps.AbortMessage() as T
  ) => {
    routeModuleIndex = ABORT_INDEX;
    return message;
  };

  const loaders: Record<string, ValueOrPromise<unknown> | undefined> = {};
  const requestEv: RequestEventInternal = {
    [RequestEvLoaders]: loaders,
    [RequestEvLoaderSerializationStrategyMap]: new Map(),
    [RequestEvMode]: serverRequestEv.mode,
    get [RequestEvRoute]() {
      return loadedRoute;
    },
    cookie,
    headers,
    env,
    method: request.method,
    signal: request.signal,
    originalUrl: new URL(url),
    get params() {
      return loadedRoute?.$params$ ?? {};
    },
    get pathname() {
      return url.pathname;
    },
    platform,
    get query() {
      return url.searchParams;
    },
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

    resetRoute,

    exit,

    cacheControl: (cacheControl: CacheControl, target: CacheControlTarget = 'Cache-Control') => {
      check();
      headers.set(target, deps.createCacheControl(cacheControl));
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
        if (loaders[id] === _UNINITIALIZED) {
          await deps.getRouteLoaderPromise(
            loaderOrAction,
            loaders,
            requestEv[RequestEvLoaderSerializationStrategyMap],
            requestEv
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

    error: <T = any>(statusCode: number, message: T) => {
      status = statusCode;
      headers.delete('Cache-Control');
      return new deps.ServerError(statusCode, message);
    },

    redirect: (statusCode: number, url: string) => {
      check();
      status = statusCode;
      if (url) {
        if (
          // //test.com
          /^\/\//.test(url) ||
          // /test//path
          /([^:])\/\/+/.test(url)
        ) {
          const fixedURL = url.replace(/^\/\/+/, '/').replace(/([^:])\/\/+/g, '$1/');
          console.warn(`Redirect URL ${url} is invalid, fixing to ${fixedURL}`);
          url = fixedURL;
        }
        headers.set('Location', url);
      }
      headers.delete('Cache-Control');
      if (statusCode > 301) {
        headers.set('Cache-Control', 'no-store');
      }
      return exit(new deps.RedirectMessage());
    },

    rewrite: (pathname: string) => {
      check();
      if (pathname.startsWith('http')) {
        throw new deps.ServerError(
          400,
          isDev ? 'Rewrite does not support absolute urls' : 'Bad Request'
        );
      }
      sharedMap.set(RequestEvIsRewrite, true);
      return exit(new deps.RewriteMessage(pathname.replace(/\/+/g, '/')));
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
      return (requestData = parseRequest(deps, requestEv, sharedMap));
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
        if (isDev) {
          const serverTiming = sharedMap.get(RequestEvShareServerTiming) as
            | [string, number][]
            | undefined;
          if (serverTiming) {
            headers.set(
              'Server-Timing',
              serverTiming.map(([name, duration]) => `${name};dur=${duration}`).join(',')
            );
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
  return requestEv;
}

export interface RequestEventInternal extends Readonly<RequestEvent>, Readonly<RequestEventLoader> {
  readonly [RequestEvLoaders]: Record<string, ValueOrPromise<unknown> | undefined>;
  readonly [RequestEvLoaderSerializationStrategyMap]: Map<string, SerializationStrategy>;
  readonly [RequestEvMode]: ServerRequestMode;
  readonly [RequestEvRoute]: LoadedRoute;

  /**
   * Check if this request is already written to.
   *
   * @returns `true`, if `getWritableStream()` has already been called.
   */
  isDirty(): boolean;

  /**
   * Reset the request event to the given route data.
   *
   * @param loadedRoute - The new loaded route.
   * @param requestHandlers - The new request handlers.
   * @param url - The new URL of the route.
   */
  resetRoute(
    loadedRoute: LoadedRoute | null,
    requestHandlers: RequestHandler<any>[],
    url: URL
  ): void;
}

export function getRequestLoaders(requestEv: RequestEventCommon) {
  return (requestEv as RequestEventInternal)[RequestEvLoaders];
}

export function getRequestLoaderSerializationStrategyMap(requestEv: RequestEventCommon) {
  return (requestEv as RequestEventInternal)[RequestEvLoaderSerializationStrategyMap];
}

export function getRequestRoute(requestEv: RequestEventCommon) {
  return (requestEv as RequestEventInternal)[RequestEvRoute];
}

export function getRequestMode(requestEv: RequestEventCommon) {
  return (requestEv as RequestEventInternal)[RequestEvMode];
}

const ABORT_INDEX = Number.MAX_SAFE_INTEGER;

const parseRequest = async (
  deps: RequestEventDeps,
  { request, method, query }: RequestEventInternal,
  sharedMap: Map<string, any>
): Promise<JSONValue | undefined> => {
  const type = deps.getContentType(request.headers);
  if (type === 'application/x-www-form-urlencoded' || type === 'multipart/form-data') {
    const formData = await request.formData();
    sharedMap.set(RequestEvSharedActionFormData, formData);
    return formToObj(formData);
  } else if (type === 'application/json') {
    const data = await request.json();
    return data;
  } else if (type === 'application/qwik-json') {
    if (method === 'GET' && query.has(deps.QDATA_KEY)) {
      const data = query.get(deps.QDATA_KEY);
      if (data) {
        try {
          return (await _deserialize(decodeURIComponent(data))) as JSONValue;
        } catch {
          //
        }
      }
    }
    return (await _deserialize(await request.text())) as JSONValue;
  }
  return undefined;
};

const isDangerousKey = (k: string) => k === '__proto__' || k === 'constructor' || k === 'prototype';
const isArrayIndexKey = (k: string) => /^(0|[1-9]\d*)$/.test(k);

const getArrayPaths = (formData: FormData) => {
  const arrayCandidates = new Map<string, boolean>();

  for (const [name] of formData) {
    const keys = name.split('.');
    let hasDangerousKey = false;

    for (const key of keys) {
      if (isDangerousKey(key)) {
        hasDangerousKey = true;
        break;
      }
    }

    if (hasDangerousKey) {
      continue;
    }

    let path = '';
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (key.endsWith('[]')) {
        break;
      }

      path = path ? `${path}.${key}` : key;
      if (!arrayCandidates.has(path)) {
        arrayCandidates.set(path, true);
      }
      if (!isArrayIndexKey(keys[i + 1])) {
        arrayCandidates.set(path, false);
      }
    }
  }

  return new Set(
    Array.from(arrayCandidates.entries())
      .filter(([, isArrayPath]) => isArrayPath)
      .map(([path]) => path)
  );
};

export const formToObj = (formData: FormData): Record<string, any> => {
  /**
   * Convert FormData to object Handle nested form input using dot notation Handle array input using
   * indexed dot notation (name.0, name.0) or bracket notation (name[]), the later is needed for
   * multiselects Create values object by form data entries
   */
  const values = Object.create(null);
  const arrayPaths = getArrayPaths(formData);

  for (const [name, value] of formData) {
    const keys = name.split('.');
    let hasDangerousKey = false;

    for (let i = 0; i < keys.length; i++) {
      if (isDangerousKey(keys[i])) {
        hasDangerousKey = true;
        break;
      }
    }

    if (hasDangerousKey) {
      continue;
    }

    let object = values;
    let path = '';
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];

      // Bracket notation for arrays, notably for multi selects
      if (key.endsWith('[]')) {
        const arrayKey = key.slice(0, -2);
        if (isDangerousKey(arrayKey)) {
          break;
        }
        const existingValue = object[arrayKey];
        if (existingValue !== undefined && !Array.isArray(existingValue)) {
          break;
        }
        object[arrayKey] = existingValue || [];
        object[arrayKey].push(value);
        break;
      }

      if (Array.isArray(object) && !isArrayIndexKey(key)) {
        break;
      }

      // If it is not last index, return nested object or array
      if (i < keys.length - 1) {
        path = path ? `${path}.${key}` : key;
        const nextValue = object[key];
        if (nextValue !== undefined) {
          object = nextValue;
          continue;
        }

        object = object[key] = arrayPaths.has(path) ? [] : Object.create(null);
      } else {
        object[key] = value;
      }
    }
  }

  // Return values object
  return values;
};
