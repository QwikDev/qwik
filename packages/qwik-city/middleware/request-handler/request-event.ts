import type { PathParams } from '@builder.io/qwik-city';
import type {
  RequestEvent,
  RequestEventLoader,
  ServerRequestEvent,
  ResponseStreamWriter,
  RequestHandler,
  RequestEventCommon,
} from './types';
import type {
  ServerAction,
  ServerActionInternal,
  ServerLoader,
  ServerLoaderInternal,
} from '../../runtime/src/server-functions';
import type { QwikCityMode } from '../../runtime/src/types';
import { Cookie } from './cookie';
import { createHeaders } from './headers';
import { ErrorResponse } from './error-handler';
import { AbortMessage, RedirectMessage } from './redirect-handler';

const RequestEvLoaders = Symbol('RequestEvLoaders');
const RequestEvLocale = Symbol('RequestEvLocale');
const RequestEvMode = Symbol('RequestEvMode');
const RequestEvStatus = Symbol('RequestEvStatus');
export const RequestEvAction = Symbol('RequestEvAction');

export function createRequestEvent(
  serverRequestEv: ServerRequestEvent,
  params: PathParams,
  requestHandlers: RequestHandler<unknown>[],
  resolved: (response: any) => void
) {
  const { request, platform } = serverRequestEv;

  const cookie = new Cookie(request.headers.get('cookie'));
  const headers = createHeaders();
  const url = new URL(request.url);

  let routeModuleIndex = -1;
  let streamInternal: ResponseStreamWriter | null = null;

  const next = async () => {
    routeModuleIndex++;

    while (routeModuleIndex < requestHandlers.length) {
      const requestHandler = requestHandlers[routeModuleIndex];
      const result = requestHandler(requestEv);
      if (result instanceof Promise) {
        await result;
      }
      routeModuleIndex++;
    }
  };

  const check = () => {
    if (streamInternal !== null) {
      throw new Error('Response already sent');
    }
  };

  const loaders: Record<string, Promise<any>> = {};

  const requestEv: RequestEventInternal = {
    [RequestEvLoaders]: loaders,
    [RequestEvLocale]: serverRequestEv.locale,
    [RequestEvMode]: serverRequestEv.mode,
    [RequestEvStatus]: 200,
    [RequestEvAction]: undefined,
    cookie,
    headers,
    method: request.method,
    params,
    pathname: url.pathname,
    platform,
    query: url.searchParams,
    request,
    url,
    sharedMap: new Map(),
    get headersSent() {
      return streamInternal !== null;
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
      const policies: string[] = [];
      if (cacheControl.immutable) {
        policies.push('immutable');
      }
      if (cacheControl.maxAge) {
        policies.push(`max-age=${cacheControl.maxAge}`);
      }
      if (cacheControl.sMaxAge) {
        policies.push(`s-maxage=${cacheControl.sMaxAge}`);
      }
      if (cacheControl.noStore) {
        policies.push('no-store');
      }
      if (cacheControl.noCache) {
        policies.push('no-cache');
      }
      if (cacheControl.private) {
        policies.push('private');
      }
      if (cacheControl.public) {
        policies.push('public');
      }
      if (cacheControl.staleWhileRevalidate) {
        policies.push(`stale-while-revalidate=${cacheControl.staleWhileRevalidate}`);
      }
      headers.set('Cache-Control', policies.join(', '));
    },

    getData: (loaderOrAction: ServerAction<any> | ServerLoader<any>) => {
      // create user request event, which is a narrowed down request context
      const id = (loaderOrAction as ServerLoaderInternal | ServerActionInternal).__qrl.getHash();

      if (
        (loaderOrAction as ServerLoaderInternal | ServerActionInternal).__brand === 'server_loader'
      ) {
        if (id in loaders) {
          throw new Error('Loader data does not exist');
        }
      }

      return loaders[id];
    },

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

    fail: (statusCode: number, data: any) => {
      check();
      requestEv[RequestEvStatus] = statusCode;
      headers.delete('Cache-Control');
      return data;
    },

    text: (statusCode: number, text: string) => {
      check();

      requestEv[RequestEvStatus] = statusCode;
      headers.set('Content-Type', 'text/plain; charset=utf-8');
      const stream = requestEv.getWriter();
      stream.write(text);
      stream.close();
      return new AbortMessage();
    },

    html: (statusCode: number, html: string) => {
      check();

      requestEv[RequestEvStatus] = statusCode;
      headers.set('Content-Type', 'text/html; charset=utf-8');
      const stream = requestEv.getWriter();
      stream.write(html);
      stream.close();
      return new AbortMessage();
    },

    json: (statusCode: number, data: any) => {
      check();

      requestEv[RequestEvStatus] = statusCode;
      headers.set('Content-Type', 'application/json; charset=utf-8');
      const stream = requestEv.getWriter();
      stream.write(JSON.stringify(data));
      stream.close();
      return new AbortMessage();
    },

    send: (statusCode: number, body: any) => {
      check();

      requestEv[RequestEvStatus] = statusCode;
      const stream = requestEv.getWriter();
      stream.write(body);
      stream.close();
      return new AbortMessage();
    },

    getWriter: () => {
      if (streamInternal === null) {
        streamInternal = serverRequestEv.getWritableStream(
          requestEv[RequestEvStatus],
          headers,
          cookie,
          resolved
        );
      }
      return streamInternal;
    },
  };

  return requestEv;
}

export interface RequestEventInternal extends RequestEvent, RequestEventLoader {
  [RequestEvLoaders]: Record<string, Promise<any>>;
  [RequestEvLocale]: string | undefined;
  [RequestEvMode]: QwikCityMode;
  [RequestEvStatus]: number;
  [RequestEvAction]: string | undefined;
}

export function getRequestLoaders(requestEv: RequestEventCommon) {
  return (requestEv as RequestEventInternal)[RequestEvLoaders];
}

export function getRequestAction(requestEv: RequestEventCommon) {
  return (requestEv as RequestEventInternal)[RequestEvAction];
}

export function setRequestAction(requestEv: RequestEventCommon, id: string) {
  (requestEv as RequestEventInternal)[RequestEvAction] = id;
}

/**
 * @alpha
 */
export class CachePolicy {
  private policies: string[] = [];
  constructor(private headers: Headers) {}

  /**
   * The max-age=N response directive indicates that the response remains fresh until N seconds after the response is generated.
   * Note that max-age is not the elapsed time since the response was received; it is the elapsed time since the response was generated on the origin server. So if the other cache(s) — on the network route taken by the response — store the response for 100 seconds (indicated using the Age response header field), the browser cache would deduct 100 seconds from its freshness lifetime.
   */
  maxAge(seconds: number) {
    return this.set(`max-age=${seconds}`);
  }

  /**
   * The s-maxage response directive also indicates how long the response is fresh for (similar to max-age) — but it is specific to shared caches, and they will ignore max-age when it is present.
   */
  sMaxAge(seconds: number) {
    return this.set(`max-age=${seconds}`);
  }

  /**
   * The stale-while-revalidate response directive indicates that the cache could reuse a stale response while it revalidates it to a cache.
   */
  staleWhileRevalidate(seconds: number) {
    return this.set(`stale-while-revalidate=${seconds}`);
  }

  /**
   * The no-store response directive indicates that any caches of any kind (private or shared) should not store this response.
   */
  noStore() {
    return this.set(`no-store`);
  }

  /**
   * The no-cache response directive indicates that the response can be stored in caches, but the response must be validated with the origin server before each reuse, even when the cache is disconnected from the origin server.
   */
  noCache() {
    return this.set(`no-cache`);
  }

  /**
   * The public response directive indicates that the response can be stored in a shared cache.
   * Responses for requests with Authorization header fields must not be stored in a shared cache; however, the public directive will cause such responses to be stored in a shared cache.
   */
  public() {
    return this.set(`public`);
  }

  /**
   * The private response directive indicates that the response can be stored only in a private cache (e.g. local caches in browsers).
   * You should add the private directive for user-personalized content, especially for responses received after login and for sessions managed via cookies.
   * If you forget to add private to a response with personalized content, then that response can be stored in a shared cache and end up being reused for multiple users, which can cause personal information to leak.
   */
  private() {
    return this.set(`private`);
  }

  /**
   * The immutable response directive indicates that the response will not be updated while it's fresh.
   *
   * A modern best practice for static resources is to include version/hashes in their URLs, while never modifying the resources — but instead, when necessary, updating the resources with newer versions that have new version-numbers/hashes, so that their URLs are different. That's called the cache-busting pattern.
   */
  immutable() {
    return this.set(`immutable`);
  }

  set(policy: string) {
    this.policies.push(policy);
    this.headers.set('Cache-Control', this.policies.join(', '));
    return this;
  }
}

export function getRequestMode(requestEv: RequestEventCommon) {
  return (requestEv as RequestEventInternal)[RequestEvMode];
}

const ABORT_INDEX = 999999999;
