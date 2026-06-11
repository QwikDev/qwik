import { isDev } from '@qwik.dev/core';
import { FULLPATH_HEADER } from '../../../runtime/src/route-loaders';
import { RedirectMessage } from '../redirect-handler';
import type { RequestEventInternal } from '../request-event-core';
import { resolveValidInternalFullPathname } from '../request-path';
import { ServerError } from '../server-error';
import type { RequestHandler, RequestEvent } from '../types';
import { addVaryHeader, sendJsonResponse, sendActionResponse } from './loader-handler';

/**
 * Early handler that wraps `next()` for JSON API requests (q-loader and q-action).
 *
 * For `IsQLoader` requests, it also rewrites the URL using the `X-Qwik-fullpath` header so that
 * downstream middleware sees the real page URL.
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

    // For loaders: rewrite URL using X-Qwik-fullpath header so middleware sees the real route
    if (isLoader) {
      addVaryHeader(requestEv, FULLPATH_HEADER);
      const pagePath = requestEv.request.headers.get(FULLPATH_HEADER);
      const pagePathname = resolveValidInternalFullPathname(requestEv.url.pathname, pagePath);
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
        if (isLoader) {
          const location = requestEv.headers.get('Location') || '/';
          requestEv.headers.delete('Location');
          await sendJsonResponse(requestEv, { r: location });
        } else {
          // Action redirects: let HTTP redirect propagate — client handles via response.redirected
          throw err;
        }
      } else if (err instanceof ServerError) {
        if (isLoader) {
          await sendJsonResponse(requestEv, { e: err, a: 1 });
        } else {
          await sendActionResponse(requestEv, { aborted: err, s: err.status });
        }
      } else if (err instanceof Error) {
        console.error('JSON request error:', err);
        const message = isDev
          ? `${err.message}\n(this is only visible in dev mode)`
          : 'Internal Server Error';
        const se = new ServerError(500, message);
        if (isLoader) {
          await sendJsonResponse(requestEv, { e: se, a: 1 });
        } else {
          await sendActionResponse(requestEv, { aborted: se, s: 500 });
        }
      } else {
        throw err; // AbortMessage etc.
      }
    }
  };
}
