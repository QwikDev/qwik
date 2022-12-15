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
import { AbortError } from './redirect-handler';

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

    next,

    exit: () => {
      routeModuleIndex = ABORT_INDEX;
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
      requestEv.getWriter().close();
      return new AbortError();
    },

    text: (statusCode: number, text: string) => {
      check();

      requestEv[RequestEvStatus] = statusCode;
      headers.set('Content-Type', 'text/plain; charset=utf-8');
      const stream = requestEv.getWriter();
      stream.write(text);
      stream.close();
      return new AbortError();
    },

    html: (statusCode: number, html: string) => {
      check();

      requestEv[RequestEvStatus] = statusCode;
      headers.set('Content-Type', 'text/html; charset=utf-8');
      const stream = requestEv.getWriter();
      stream.write(html);
      stream.close();
      return new AbortError();
    },

    json: (statusCode: number, data: any) => {
      check();

      requestEv[RequestEvStatus] = statusCode;
      headers.set('Content-Type', 'application/json; charset=utf-8');
      const stream = requestEv.getWriter();
      stream.write(JSON.stringify(data));
      stream.close();
      return new AbortError();
    },

    send: (statusCode: number, body: any) => {
      check();

      requestEv[RequestEvStatus] = statusCode;
      const stream = requestEv.getWriter();
      stream.write(body);
      stream.close();
      return new AbortError();
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

export function getRequestMode(requestEv: RequestEventCommon) {
  return (requestEv as RequestEventInternal)[RequestEvMode];
}

const ABORT_INDEX = 999999999;
