import type { ResponseStreamWriter, ServerRequestEvent, UserResponseContext } from './types';
import type { PageModule, PathParams, RouteModule } from '../../runtime/src/types';
import { Cookie } from './cookie';
import { createHeaders } from './headers';
import { ErrorResponse } from './error-handler';
import { HttpStatus } from './http-status-codes';
import { isRedirectStatus, RedirectResponse } from './redirect-handler';
import { validateSerializable } from '../../utils/format';
import { isFunction } from '../../../qwik/src/core/util/types';
import { resolveRequestHandlers } from './resolve-request-handlers';
import { createRequestEvent } from './request-event';

export async function loadUserResponse(
  serverRequestEv: ServerRequestEvent,
  params: PathParams,
  routeModules: RouteModule[],
  trailingSlash?: boolean,
  basePathname: string = '/'
) {
  if (routeModules.length === 0) {
    throw new ErrorResponse(HttpStatus.NotFound, `Not Found`);
  }

  const { locale, url } = serverRequestEv;
  const { pathname } = url;
  const { method, headers } = serverRequestEv.request;
  const isPageModule = isLastModulePageRoute(routeModules);
  const isPageDataReq = isPageModule && pathname.endsWith(QDATA_JSON);
  const isEndpointReq = !isPageModule && !isPageDataReq;

  const { requestHandlers, serverLoaders, serverActions } = resolveRequestHandlers(
    routeModules,
    method
  );

  const stream: ResponseStreamWriter = {
    write: (chunk: any) => {
      if (userResponseCtx.isEnded) {
        throw new Error(`Response has already been ended`);
      }
      userResponseCtx.writeQueue.push(chunk);
    },
    end: () => {
      userResponseCtx.isEnded = true;
    },
  };

  const userResponseCtx: UserResponseContext = {
    type: isPageDataReq ? 'pagedata' : isPageModule && !isEndpointReq ? 'pagehtml' : 'endpoint',
    url,
    params,
    locale,
    status: HttpStatus.Ok,
    headers: createHeaders(),
    cookie: new Cookie(headers.get('cookie')),
    aborted: false,
    loaders: {},
    routeModuleIndex: -1,
    requestHandlers,
    serverLoaders,
    serverActions,
    stream,
    writeQueue: [],
    isEnded: false,
  };

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

  const requestEv = createRequestEvent(serverRequestEv, params, userResponseCtx);

  await requestEv.next();

  userResponseCtx.aborted = userResponseCtx.routeModuleIndex >= ABORT_INDEX;

  if (
    !isPageDataReq &&
    isRedirectStatus(userResponseCtx.status) &&
    userResponseCtx.headers.has('Location')
  ) {
    // user must have manually set redirect instead of throw response.redirect()
    // never render the page if the user manually set the status to be a redirect
    throw new RedirectResponse(
      userResponseCtx.headers.get('Location')!,
      userResponseCtx.status,
      userResponseCtx.headers,
      userResponseCtx.cookie
    );
  }

  // this request/method does NOT have a handler
  if (isEndpointReq && requestHandlers.length === 0) {
    // didn't find any handlers
    // endpoints should respond with 405 Method Not Allowed
    throw new ErrorResponse(HttpStatus.MethodNotAllowed, `Method Not Allowed`);
  }

  if (!userResponseCtx.aborted) {
    const selectedAction = url.searchParams.get('qaction');
    if (method === 'POST' && selectedAction) {
      const action = serverActions.find((a) => a.__qrl.getHash() === selectedAction);
      if (action) {
        const form = await serverRequestEv.request.formData();
        const actionResolved = await action.__qrl(form, requestEv);
        userResponseCtx.loaders[selectedAction] = actionResolved;
      }
    }

    if (serverLoaders.length > 0) {
      // if (userResponse.bodySent) {
      //   throw new Error('Body already sent');
      // }

      const isDevMode = serverRequestEv.mode === 'dev';

      await Promise.all(
        serverLoaders.map(async (loader) => {
          const loaderId = loader.__qrl.getHash();
          const loaderResolved = await loader.__qrl(requestEv);
          userResponseCtx.loaders[loaderId] = isFunction(loaderResolved)
            ? loaderResolved()
            : loaderResolved;

          if (isDevMode) {
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

  return userResponseCtx;
}

// export function isEndPointRequest(
//   method: string,
//   acceptHeader: string | null,
//   contentTypeHeader: string | null
// ) {
//   if (method === 'GET' || method === 'POST') {
//     // further check if GET or POST is an endpoint request
//     // check if there's an Accept request header
//     if (contentTypeHeader && contentTypeHeader.includes('application/json')) {
//       return true;
//     }

//     if (acceptHeader) {
//       const htmlIndex = acceptHeader.indexOf('text/html');
//       if (htmlIndex === 0) {
//         // starts with text/html
//         // not an endpoint GET/POST request
//         return false;
//       }

//       const jsonIndex = acceptHeader.indexOf('application/json');
//       if (jsonIndex > -1) {
//         // has application/json Accept header
//         if (htmlIndex > -1) {
//           // if application/json before text/html
//           // then it's an endpoint GET/POST request
//           return jsonIndex < htmlIndex;
//         }
//         return true;
//       }
//     }

//     // not an endpoint GET/POST request
//     return false;
//   } else {
//     // always endpoint for non-GET/POST request
//     // PUT, PATCH, DELETE, OPTIONS, HEAD, etc
//     return true;
//   }
// }

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
