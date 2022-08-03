import { Headers } from './headers';
import type {
  EndpointHandler,
  EndpointModule,
  RequestEvent,
  ResponseContext,
  RouteParams,
} from '../../runtime/src/library/types';
import type { QwikCityRequestContext, UserResponseContext } from './types';
import { HttpStatus } from './http-status-codes';

export async function loadUserResponse(
  requestCtx: QwikCityRequestContext,
  params: RouteParams,
  endpointModules: EndpointModule[],
  trailingSlash?: boolean,
  isEndpointOnly?: boolean
) {
  const { request, url } = requestCtx;
  const { pathname } = url;
  const userResponse: UserResponseContext = {
    url,
    params,
    status: HttpStatus.Ok,
    headers: new Headers(),
    resolvedBody: undefined,
    pendingBody: undefined,
    isEndpointOnly: isEndpointOnly || request.headers.get('Accept') === 'application/json',
  };

  let hasRequestMethodHandler = false;

  if (!userResponse.isEndpointOnly && pathname !== '/') {
    // only check for slash redirect on pages
    if (trailingSlash) {
      // must have a trailing slash
      if (!pathname.endsWith('/')) {
        // add slash to existing pathname
        return pageRedirect(userResponse, pathname + '/');
      }
    } else {
      // should not have a trailing slash
      if (pathname.endsWith('/')) {
        // remove slash from existing pathname
        return pageRedirect(userResponse, pathname.slice(0, pathname.length - 1));
      }
    }
  }

  let middlewareIndex = -1;

  const abort = () => {
    middlewareIndex = ABORT_INDEX;
  };

  const redirect = (url: string, status?: number) => {
    userResponse.status = typeof status === 'number' ? status : HttpStatus.TemporaryRedirect;
    userResponse.headers.set('Location', url);
    abort();
  };

  const next = async () => {
    middlewareIndex++;

    while (middlewareIndex < endpointModules.length) {
      const endpointModule = endpointModules[middlewareIndex];

      let reqHandler: EndpointHandler | undefined = undefined;

      switch (request.method) {
        case 'GET': {
          reqHandler = endpointModule.onGet;
          break;
        }
        case 'POST': {
          reqHandler = endpointModule.onPost;
          break;
        }
        case 'PUT': {
          reqHandler = endpointModule.onPut;
          break;
        }
        case 'PATCH': {
          reqHandler = endpointModule.onPatch;
          break;
        }
        case 'OPTIONS': {
          reqHandler = endpointModule.onOptions;
          break;
        }
        case 'HEAD': {
          reqHandler = endpointModule.onHead;
          break;
        }
        case 'DELETE': {
          reqHandler = endpointModule.onDelete;
          break;
        }
      }

      reqHandler = reqHandler || endpointModule.onRequest;

      if (typeof reqHandler === 'function') {
        hasRequestMethodHandler = true;

        const response: ResponseContext = {
          get status() {
            return userResponse.status;
          },
          set status(code) {
            userResponse.status = code;
          },
          get headers() {
            return userResponse.headers;
          },
          redirect,
        };

        // create user request event, which is a narrowed down request context
        const requstEv: RequestEvent = {
          request: { ...request },
          url: new URL(url),
          params: { ...params },
          response,
          next,
          abort,
        };

        // get the user's endpoint returned data
        const syncData = reqHandler(requstEv) as any;

        if (typeof syncData === 'function') {
          // sync returned function
          userResponse.pendingBody = createPendingBody(syncData);
        } else if (
          syncData !== null &&
          typeof syncData === 'object' &&
          typeof syncData.then === 'function'
        ) {
          // async returned promise
          const asyncResolved = await syncData;
          if (typeof asyncResolved === 'function') {
            // async resolved function
            userResponse.pendingBody = createPendingBody(asyncResolved);
          } else {
            // async resolved data
            userResponse.resolvedBody = asyncResolved;
          }
        } else {
          // sync returned data
          userResponse.resolvedBody = syncData;
        }
      }

      middlewareIndex++;
    }
  };

  await next();

  if (
    userResponse.status >= HttpStatus.MovedPermanently &&
    userResponse.status <= HttpStatus.PermanentRedirect
  ) {
    userResponse.isEndpointOnly = true;
  }

  if (userResponse.isEndpointOnly && !hasRequestMethodHandler) {
    userResponse.status = HttpStatus.MethodNotAllowed;
  }

  return userResponse;
}

function createPendingBody(cb: () => any) {
  return new Promise<any>((resolve, reject) => {
    try {
      const rtn = cb();
      if (rtn !== null && typeof rtn === 'object' && typeof rtn.then === 'function') {
        // callback return promise
        rtn.then(resolve, reject);
      } else {
        // callback returned data
        resolve(rtn);
      }
    } catch (e) {
      // sync callback errored
      reject(e);
    }
  });
}

function pageRedirect(userResponse: UserResponseContext, updatedPathname: string) {
  userResponse.status = HttpStatus.PermanentRedirect;
  userResponse.headers.set('Location', updatedPathname + userResponse.url.search);
  return userResponse;
}

const ABORT_INDEX = 999999999;
