import type { PathParams } from '@builder.io/qwik-city';
import type {
  ServerAction,
  ServerActionInternal,
  ServerLoader,
  ServerLoaderInternal,
} from '../../runtime/src/server-functions';
import type {
  RequestEvent,
  RequestEventLoader,
  ServerRequestEvent,
  ResponseStreamWriter,
  RequestHandler,
  RequestEventCommon,
} from './types';
import { ErrorResponse } from './error-handler';
import { RedirectResponse } from './redirect-handler';
import { Cookie } from './cookie';
import { createHeaders } from './headers';

const RequestEvLoaders = Symbol('RequestEvLoaders');

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
      if (typeof requestHandler === 'function') {
        const result = requestHandler(requestEv);
        if (result instanceof Promise) {
          await result;
        }
      }
      routeModuleIndex++;
    }
  };

  const check = () => {
    if (streamInternal) {
      throw new Error('Response already sent');
    }
  };

  const loaders: Record<string, Promise<any>> = {};

  const requestEv: RequestEventInternal = {
    cookie,
    headers,
    language: serverRequestEv.locale,
    method: request.method,
    params,
    pathname: url.pathname,
    platform,
    query: url.searchParams,
    request,
    statusCode: 200,
    url,
    [RequestEvLoaders]: loaders,

    next,

    abort: () => {
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
        requestEv.statusCode = statusCode;
      }
      return requestEv.statusCode;
    },

    locale: (locale?: string) => {
      if (typeof locale === 'string') {
        requestEv.language = locale;
      }
      return requestEv.language || '';
    },

    error: (statusCode: number, message: string) => {
      requestEv.statusCode = statusCode;
      headers.delete('Cache-Control');
      return new ErrorResponse(statusCode, message);
    },

    redirect: (statusCode: number, url: string) => {
      check();
      requestEv.statusCode = statusCode;
      headers.set('Location', url);
      headers.delete('Cache-Control');
      requestEv.getWriter().close();
      return new RedirectResponse();
    },

    html: (statusCode: number, html: string) => {
      check();

      requestEv.statusCode = statusCode;
      headers.set('Content-Type', 'text/html; charset=utf-8');
      const stream = requestEv.getWriter();
      stream.write(html);
      stream.close();
    },

    json: (statusCode: number, data: any) => {
      check();

      requestEv.statusCode = statusCode;
      headers.set('Content-Type', 'application/json; charset=utf-8');
      const stream = requestEv.getWriter();
      stream.write(JSON.stringify(data));
      stream.close();
    },

    send: (statusCode: number, body: any) => {
      check();

      requestEv.statusCode = statusCode;
      const stream = requestEv.getWriter();
      stream.write(body);
      stream.close();
    },

    getWriter: () => {
      if (streamInternal === null) {
        streamInternal = serverRequestEv.sendHeaders(
          requestEv.statusCode,
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

interface RequestEventInternal extends RequestEvent, RequestEventLoader {
  statusCode: number;
  language: string | undefined;
  [RequestEvLoaders]: Record<string, Promise<any>>;
}

export function getLoaders(requestEv: RequestEventCommon) {
  return (requestEv as RequestEventInternal)[RequestEvLoaders];
}

const ABORT_INDEX = 999999999;
