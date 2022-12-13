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
  UserResponseContext,
  ServerRequestEvent,
  ResponseStreamWriter,
} from './types';
import { ErrorResponse } from './error-handler';
import { RedirectResponse } from './redirect-handler';

const UserResponseContext = Symbol('UserResponseContext');

export function createRequestEvent(
  serverRequestEv: ServerRequestEvent,
  params: PathParams,
  userResponseCtx: UserResponseContext,
  resolved: (response: any) => void
) {
  const { request, platform } = serverRequestEv;
  const { cookie, headers, requestHandlers } = userResponseCtx;
  const url = new URL(request.url);

  const next = async () => {
    routeModuleIndex++;

    while (routeModuleIndex < requestHandlers.length) {
      const requestHandler = requestHandlers[routeModuleIndex];
      // TODO
      await (requestHandler as any)(requestEv, userResponseCtx, serverRequestEv);
      routeModuleIndex++;
    }
  };

  let routeModuleIndex = -1;
  let stream: ResponseStreamWriter | undefined;

  const requestEv: RequestEvent & RequestEventLoader = {
    cookie,
    headers,
    method: request.method,
    params,
    pathname: url.pathname,
    platform,
    query: url.searchParams,
    request,
    url,

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
        if (id in userResponseCtx.loaders) {
          throw new Error('Loader data does not exist');
        }
      }

      return userResponseCtx.loaders[id];
    },

    status: (statusCode: number) => {
      userResponseCtx.status = statusCode;
    },

    locale: (locale: string) => {
      userResponseCtx.locale = locale;
    },

    error: (status: number, message: string) => {
      userResponseCtx.status = status;
      headers.delete('Cache-Control');
      return new ErrorResponse(status, message);
    },

    redirect: (status: number, url: string) => {
      userResponseCtx.status = status;
      headers.set('Location', url);
      headers.delete('Cache-Control');
      userResponseCtx.stream.end();
      return new RedirectResponse();
    },

    html: (statusCode: number, html: string) => {
      headers.set('Content-Type', 'text/html; charset=utf-8');
      userResponseCtx.status = statusCode;
      userResponseCtx.stream.write(html);
      userResponseCtx.stream.end();
    },

    json: (statusCode: number, data: any) => {
      headers.set('Content-Type', 'application/json; charset=utf-8');
      userResponseCtx.status = statusCode;
      userResponseCtx.stream.write(JSON.stringify(data));
      userResponseCtx.stream.end();
    },

    send: (statusCode: number, body: any) => {
      userResponseCtx.status = statusCode;
      userResponseCtx.stream.write(body);
      userResponseCtx.stream.end();
    },

    get stream() {
      if (!stream) {
        stream = serverRequestEv.sendHeaders(
          userResponseCtx.status,
          userResponseCtx.headers,
          userResponseCtx.cookie,
          resolved
        );
      }
      return stream;
    },
  };

  return requestEv;
}

const ABORT_INDEX = 999999999;
