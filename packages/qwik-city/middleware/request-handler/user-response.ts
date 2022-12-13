import type { ServerRequestEvent } from './types';
import type { PathParams, RequestEvent, RequestHandler } from '../../runtime/src/types';
import { createRequestEvent } from './request-event';
import { ErrorResponse } from './error-handler';
import { HttpStatus } from './http-status-codes';

export async function runQwikCity<T>(
  serverRequestEv: ServerRequestEvent<T>,
  params: PathParams,
  requestHandlers: RequestHandler<unknown>[],
  trailingSlash?: boolean,
  basePathname: string = '/'
) {
  if (requestHandlers.length === 0) {
    throw new ErrorResponse(HttpStatus.NotFound, `Not Found`);
  }

  const { url } = serverRequestEv;
  const { pathname } = url;

  return new Promise<T>((resolve) => {
    const requestEv = createRequestEvent(serverRequestEv, params, requestHandlers, resolve);
    // Handle trailing slash redirect
    if (pathname !== basePathname && !pathname.endsWith('.html')) {
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
    requestEv.getWriter();
    resolve(true)
  }
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

export const QDATA_JSON = '/q-data.json';
const QDATA_JSON_LEN = QDATA_JSON.length;
