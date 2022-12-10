import type { QwikCityRequestContext, UserResponseContext } from './types';
import type {
  RequestHandler,
  PageModule,
  PathParams,
  RequestEvent,
  RouteModule,
} from '../../runtime/src/types';
import { Cookie } from './cookie';
import { createHeaders } from './headers';
import { ErrorResponse } from './error-handler';
import { HttpStatus } from './http-status-codes';
import { isRedirectStatus, RedirectResponse } from './redirect-handler';
import { ResponseContext } from './response-context';
import { validateSerializable } from '../../utils/format';
import type {
  ServerActionInternal,
  ServerLoaderInternal,
} from 'packages/qwik-city/runtime/src/server-functions';
import { isFunction } from 'packages/qwik/src/core/util/types';

export async function loadUserResponse(
  requestCtx: QwikCityRequestContext,
  params: PathParams,
  routeModules: RouteModule[],
  trailingSlash?: boolean,
  basePathname: string = '/'
) {
  if (routeModules.length === 0) {
    throw new ErrorResponse(HttpStatus.NotFound, `Not Found`);
  }

  const { request, url, platform } = requestCtx;
  const { pathname } = url;
  const { method, headers } = request;
  const isPageModule = isLastModulePageRoute(routeModules);
  const isPageDataReq = isPageModule && pathname.endsWith(QDATA_JSON);
  const isEndpointReq =
    !isPageDataReq && isEndPointRequest(method, headers.get('Accept'), headers.get('Content-Type'));

  const cookie = new Cookie(headers.get('cookie'));
  const serverLoaders: ServerLoaderInternal[] = [];
  const serverActions: ServerActionInternal[] = [];
  const userResponse: UserResponseContext = {
    type: isPageDataReq ? 'pagedata' : isPageModule && !isEndpointReq ? 'pagehtml' : 'endpoint',
    url,
    params,
    status: HttpStatus.Ok,
    headers: createHeaders(),
    resolvedBody: undefined,
    pendingBody: undefined,
    cookie,
    aborted: false,
    loaders: {},
    bodySent: false,
  };
  let hasRequestMethodHandler = false;

  if (isPageModule && !isPageDataReq && pathname !== basePathname && !pathname.endsWith('.html')) {
    // only check for slash redirect on pages
    if (trailingSlash) {
      // must have a trailing slash
      if (!pathname.endsWith('/')) {
        // add slash to existing pathname
        throw new RedirectResponse(pathname + '/' + url.search, HttpStatus.Found);
      }
    } else {
      // should not have a trailing slash
      if (pathname.endsWith('/')) {
        // remove slash from existing pathname
        throw new RedirectResponse(
          pathname.slice(0, pathname.length - 1) + url.search,
          HttpStatus.Found
        );
      }
    }
  }

  let routeModuleIndex = -1;

  const abort = () => {
    routeModuleIndex = ABORT_INDEX;
  };

  // create user request event, which is a narrowed down request context
  const requestEv: RequestEvent = {
    request,
    url: new URL(url),
    query: new URLSearchParams(url.search),
    params: { ...params },
    response: new ResponseContext(userResponse, requestCtx),
    platform,
    cookie,
    next,
    abort,
  };
  async function next() {
    routeModuleIndex++;

    while (routeModuleIndex < routeModules.length) {
      const endpointModule = routeModules[routeModuleIndex];

      if (typeof endpointModule.onRequest === 'function') {
        hasRequestMethodHandler = true;
        await endpointModule.onRequest(requestEv);
      }

      if (routeModuleIndex < ABORT_INDEX) {
        let methodReqHandler: RequestHandler | undefined = undefined;
        switch (method) {
          case 'GET': {
            methodReqHandler = endpointModule.onGet;
            break;
          }
          case 'POST': {
            methodReqHandler = endpointModule.onPost;
            break;
          }
          case 'PUT': {
            methodReqHandler = endpointModule.onPut;
            break;
          }
          case 'PATCH': {
            methodReqHandler = endpointModule.onPatch;
            break;
          }
          case 'DELETE': {
            methodReqHandler = endpointModule.onDelete;
            break;
          }
          case 'OPTIONS': {
            methodReqHandler = endpointModule.onOptions;
            break;
          }
          case 'HEAD': {
            methodReqHandler = endpointModule.onHead;
            break;
          }
        }

        if (typeof methodReqHandler === 'function') {
          hasRequestMethodHandler = true;
          await methodReqHandler(requestEv);
        }

        if (routeModuleIndex < ABORT_INDEX) {
          const loaders = Object.values(endpointModule).filter(
            (e) => '__brand_server_loader' in e
          ) as any[];
          const actions = Object.values(endpointModule).filter(
            (e) => '__brand_server_action' in e
          ) as any[];
          if (actions.length > 0) {
            if (userResponse.bodySent) {
              throw new Error('Body already sent');
            }
            hasRequestMethodHandler = true;
            serverActions.push(...actions);
          }

          if (loaders.length > 0) {
            if (userResponse.bodySent) {
              throw new Error('Body already sent');
            }
            hasRequestMethodHandler = true;
            serverLoaders.push(...loaders);
          }
        }
      }

      routeModuleIndex++;
    }
  }

  await next();

  userResponse.aborted = routeModuleIndex >= ABORT_INDEX;

  if (
    !isPageDataReq &&
    isRedirectStatus(userResponse.status) &&
    userResponse.headers.has('Location')
  ) {
    // user must have manually set redirect instead of throw response.redirect()
    // never render the page if the user manually set the status to be a redirect
    throw new RedirectResponse(
      userResponse.headers.get('Location')!,
      userResponse.status,
      userResponse.headers,
      userResponse.cookie
    );
  }

  if (hasRequestMethodHandler) {
    // this request/method has a handler
    if (isPageModule && method === 'GET') {
      if (!userResponse.headers.has('Vary')) {
        // if a page also has a GET handler, then auto-add the Accept Vary header
        userResponse.headers.set('Vary', 'Content-Type, Accept');
      }
    }
  } else {
    // this request/method does NOT have a handler
    if ((isEndpointReq && !isPageDataReq) || !isPageModule) {
      // didn't find any handlers
      // endpoints should respond with 405 Method Not Allowed
      throw new ErrorResponse(HttpStatus.MethodNotAllowed, `Method Not Allowed`);
    }
  }

  if (routeModuleIndex < ABORT_INDEX) {
    if (serverLoaders.length > 0) {
      if (userResponse.bodySent) {
        throw new Error('Body already sent');
      }

      hasRequestMethodHandler = true;
      await Promise.all(
        serverLoaders.map(async (loader) => {
          const loaderId = loader.__qrl.getHash();
          const loaderResolved = await loader.__qrl(requestEv);
          userResponse.loaders[loaderId] = isFunction(loaderResolved)
            ? loaderResolved()
            : loaderResolved;

          if (requestCtx.mode === 'dev') {
            try {
              validateSerializable(loaderResolved);
            } catch (e: any) {
              throw Object.assign(e, {
                id: 'DEV_SERIALIZE',
                method,
              });
            }
          }
        })
      );
    }
  }

  return userResponse;
}

export function isEndPointRequest(
  method: string,
  acceptHeader: string | null,
  contentTypeHeader: string | null
) {
  if (method === 'GET' || method === 'POST') {
    // further check if GET or POST is an endpoint request
    // check if there's an Accept request header
    if (contentTypeHeader && contentTypeHeader.includes('application/json')) {
      return true;
    }

    if (acceptHeader) {
      const htmlIndex = acceptHeader.indexOf('text/html');
      if (htmlIndex === 0) {
        // starts with text/html
        // not an endpoint GET/POST request
        return false;
      }

      const jsonIndex = acceptHeader.indexOf('application/json');
      if (jsonIndex > -1) {
        // has application/json Accept header
        if (htmlIndex > -1) {
          // if application/json before text/html
          // then it's an endpoint GET/POST request
          return jsonIndex < htmlIndex;
        }
        return true;
      }
    }

    // not an endpoint GET/POST request
    return false;
  } else {
    // always endpoint for non-GET/POST request
    // PUT, PATCH, DELETE, OPTIONS, HEAD, etc
    return true;
  }
}

// function createPendingBody(cb: () => any) {
//   return new Promise<any>((resolve, reject) => {
//     try {
//       const rtn = cb();
//       if (rtn !== null && typeof rtn === 'object' && typeof rtn.then === 'function') {
//         // callback return promise
//         rtn.then(resolve, reject);
//       } else {
//         // callback returned data
//         resolve(rtn);
//       }
//     } catch (e) {
//       // sync callback errored
//       reject(e);
//     }
//   });
// }

function isLastModulePageRoute(routeModules: RouteModule[]) {
  const lastRouteModule = routeModules[routeModules.length - 1];
  return lastRouteModule && typeof (lastRouteModule as PageModule).default === 'function';
}

/**
 * The pathname used to match in the route regex array.
 * A pathname ending with /q-data.json should be treated as a pathname without it.
 */
export function getRouteMatchPathname(pathname: string, trailingSlash: boolean | undefined) {
  if (pathname.endsWith(QDATA_JSON)) {
    const trimEnd = pathname.length - QDATA_JSON_LEN + (trailingSlash ? 1 : 0);
    pathname = pathname.slice(0, trimEnd);
    if (pathname === '') {
      pathname = '/';
    }
  }
  return pathname;
}

const QDATA_JSON = '/q-data.json';
const QDATA_JSON_LEN = QDATA_JSON.length;

const ABORT_INDEX = 999999999;
