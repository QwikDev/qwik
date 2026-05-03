import { isDev } from '@qwik.dev/core';
import { FULLPATH_HEADER } from '../../../runtime/src/route-loaders';
import { ensureSlash } from '../../../utils/pathname';
import { RedirectMessage } from '../redirect-handler';
import type { RequestEventInternal } from '../request-event-core';
import { IsQLoader, IsQAction } from '../request-path';
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

    const isLoader = requestEv.sharedMap.has(IsQLoader);
    const isActionJson =
      requestEv.sharedMap.has(IsQAction) &&
      requestEv.request.headers.get('accept')?.includes('application/json');

    if (!isLoader && !isActionJson) {
      return;
    }

    // For loaders: rewrite URL using X-Qwik-fullpath header so middleware sees the real route
    if (isLoader) {
      addVaryHeader(requestEv, FULLPATH_HEADER);
      const pagePath = requestEv.request.headers.get(FULLPATH_HEADER);
      const pagePathname = resolveValidFullPath(requestEv, pagePath);
      if (pagePathname) {
        requestEv.url.pathname = pagePathname;
      }
    }

    // Wrap all downstream handlers in try/catch so middleware redirects/errors
    // become JSON responses instead of HTTP redirects/error pages
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
          await sendJsonResponse(requestEv, { e: err });
        } else {
          await sendActionResponse(requestEv, { e: err, s: err.status });
        }
      } else if (err instanceof Error) {
        console.error('JSON request error:', err);
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

function resolveValidFullPath(requestEv: RequestEventInternal, pagePath: string | null) {
  if (!pagePath || !pagePath.startsWith('/') || pagePath.startsWith('//')) {
    return undefined;
  }
  try {
    // Protect against malicious X-Qwik-fullpath values that could cause SSRF or cache poisoning. Only allow if it's a relative path below the loader pathname.
    const pageUrl = new URL(pagePath, requestEv.url.origin);
    if (pageUrl.origin !== requestEv.url.origin) {
      return undefined;
    }
    const pagePathname = pageUrl.pathname;
    const loaderPathname = requestEv.url.pathname;
    if (pagePathname === loaderPathname) {
      return undefined;
    }
    const loaderPrefix = ensureSlash(loaderPathname);
    return pagePathname.startsWith(loaderPrefix) ? pagePathname : undefined;
  } catch {
    return undefined;
  }
}
