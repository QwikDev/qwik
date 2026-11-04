import type { RequestEvent, RequestHandler } from '../types';
import { IsQRoute } from '../request-path';

/**
 * Answers `q-route.json` requests with the pathname the URL finally routes to, after any
 * `rewrite()`. It sits after the plugins and route middleware, so a rewrite has already re-resolved
 * the route by the time it runs. Lets the client load a rewrite target it can't match by itself.
 *
 * The response carries the headers set so far, so a middleware can make a rewrite cacheable with
 * `cacheControl()` / `headers.set('Cache-Tag', ...)` before `throw rewrite(...)`.
 */
export function routeResolveHandler(): RequestHandler {
  return (requestEv: RequestEvent) => {
    if (!requestEv.sharedMap.has(IsQRoute) || requestEv.headersSent || requestEv.exited) {
      return;
    }
    // Caching is up to the middleware that rewrites (cacheControl(), Cache-Tag, ...), same as for
    // loaders: private unless it said otherwise.
    if (!requestEv.headers.has('Cache-Control')) {
      requestEv.cacheControl('private');
    }
    requestEv.json(200, { p: requestEv.url.pathname });
  };
}
