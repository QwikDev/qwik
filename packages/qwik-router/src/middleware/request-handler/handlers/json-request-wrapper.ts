import { isDev } from '@qwik.dev/core';
import { FULLPATH_HEADER, ROUTE_PATH_HEADER } from '../../../runtime/src/route-loaders';
import { RedirectMessage } from '../redirect-handler';
import type { RequestEventInternal } from '../request-event-core';
import { resolveValidInternalFullPathname } from '../request-path';
import { ServerError } from '../server-error';
import type { RequestHandler, RequestEvent } from '../types';
import { addVaryHeader, sendJsonResponse, sendActionResponse } from './loader-handler';

/** Shared by route selection and the URL rewrite so both agree on the page. */
export function resolveLoaderPagePathname(
  request: Request,
  loaderPathname: string,
  isDevRequest = isDev
) {
  const routePath =
    request.headers.get(FULLPATH_HEADER) ??
    (isDevRequest ? request.headers.get(ROUTE_PATH_HEADER) : null);
  return resolveValidInternalFullPathname(loaderPathname, routePath);
}

/**
 * Early handler that wraps `next()` for JSON API requests (q-loader and q-action).
 *
 * For `IsQLoader` requests, it also rewrites the URL using the `X-Qwik-fullpath` header (or the dev
 * `X-Qwik-route-path` header) so that downstream middleware sees the real page URL.
 *
 * By calling `await next()` inside a try/catch, middleware redirects and errors are captured and
 * returned as JSON envelopes instead of HTTP redirects/error pages. This keeps SPA navigation
 * intact on the client.
 */

export function jsonRequestWrapper(): RequestHandler {
  return async (requestEvent: RequestEvent) => {
    const requestEv = requestEvent as RequestEventInternal;

    const isLoader = requestEv.internalRequest === 'loader';
    const isActionJson = requestEv.internalRequest === 'action';

    if (!isLoader && !isActionJson) {
      return;
    }

    // For loaders: rewrite URL using the page path header so middleware sees the real route
    if (isLoader) {
      addVaryHeader(requestEv, FULLPATH_HEADER);
      if (isDev) {
        addVaryHeader(requestEv, ROUTE_PATH_HEADER);
      }
      const pagePathname = resolveLoaderPagePathname(requestEv.request, requestEv.url.pathname);
      if (pagePathname) {
        requestEv.url.pathname = pagePathname;
      }
    }

    // Wrap all downstream handlers in try/catch so middleware redirects/errors
    // become JSON responses instead of HTTP redirects/error pages.
    try {
      await requestEv.next();
    } catch (err) {
      if (requestEv.headersSent) {
        return;
      }
      if (err instanceof RedirectMessage) {
        const location = requestEv.headers.get('Location') || '/';
        requestEv.headers.delete('Location');
        if (isLoader) {
          await sendJsonResponse(requestEv, { r: location });
        } else {
          // Return the redirect as JSON (status 200) so the client navigates itself. A real HTTP
          // 3xx would be auto-followed by fetch, turning the action POST into a GET of the target.
          await sendActionResponse(requestEv, { redirect: location });
        }
      } else if (err instanceof ServerError) {
        requestEv.headers.set('Cache-Control', 'no-store');
        if (isLoader) {
          await sendJsonResponse(requestEv, { e: err });
        } else {
          await sendActionResponse(requestEv, { e: err, s: err.status });
        }
      } else if (err instanceof Error) {
        console.error('JSON request error:', err);
        requestEv.headers.set('Cache-Control', 'no-store');
        const message = isDev
          ? `${err.message}\n(this is only visible in dev mode)`
          : 'Internal Server Error';
        const se = new ServerError(500, message);
        if (isLoader) {
          await sendJsonResponse(requestEv, { e: se });
        } else {
          await sendActionResponse(requestEv, { e: se, s: 500 });
        }
      } else {
        throw err; // AbortMessage etc.
      }
    }
  };
}
