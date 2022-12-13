import type { ResponseStreamWriter, ServerRequestEvent, UserResponseContext } from './types';
import type { PageModule, PathParams, RequestEvent, RouteModule } from '../../runtime/src/types';
import { Cookie } from './cookie';
import { createHeaders } from './headers';
import { createRequestEvent } from './request-event';
import { ErrorResponse } from './error-handler';
import { HttpStatus } from './http-status-codes';
import { resolveRequestHandlers } from './resolve-request-handlers';
import { createRequestEvent } from './request-event';

export async function loadUserResponse<T>(
  serverRequestEv: ServerRequestEvent<T>,
  params: PathParams,
  routeModules: RouteModule[],
  trailingSlash?: boolean,
  basePathname: string = '/'
) {
  if (routeModules.length === 0) {
    throw new ErrorResponse(HttpStatus.NotFound, `Not Found`);
  }

  const { url } = serverRequestEv;
  const { pathname } = url;
  const isPageModule = isLastModulePageRoute(routeModules);
  const isPageDataReq = isPageModule && pathname.endsWith(QDATA_JSON);
  const isEndpointReq = !isPageModule && !isPageDataReq;

  return new Promise<T>((resolve) => {
    const requestEv = createRequestEvent(serverRequestEv, params, routeModules, resolve);

    // this request/method does NOT have a handler
    if (isEndpointReq && requestHandlers.length === 0) {
      // didn't find any handlers
      // endpoints should respond with 405 Method Not Allowed
      throw requestEv.error(HttpStatus.MethodNotAllowed, `Method Not Allowed`);
    }

    // Handle trailing slash redirect
    if (
      isPageModule &&
      !isPageDataReq &&
      pathname !== basePathname &&
      !pathname.endsWith('.html')
    ) {
      // only check for slash redirect on pages
      if (trailingSlash) {
        // must have a trailing slash
        if (!pathname.endsWith('/')) {
          // add slash to existing pathname
          throw requestEv.redirect(HttpStatus.Found, pathname + '/' + url.search);
        }
      } else {
        // should not have a trailing slash
        if (pathname.endsWith('/')) {
          // remove slash from existing pathname
          throw requestEv.redirect(
            HttpStatus.Found,
            pathname.slice(0, pathname.length - 1) + url.search
          );
        }
      }
    }
    runNext(requestEv, resolve);
  });
}

async function runNext(requestEv: RequestEvent, resolve: (value: any) => void) {
  try {
    await requestEv.next();
  } finally {
    resolve(null);
  }
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
