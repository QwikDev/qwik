import type { RequestEvent, RequestHandler } from '../types';
import { IsQRoute } from '../request-path';

/**
 * Answers `q-route.json` requests with the pathname the URL finally routes to, after any
 * `rewrite()`. It sits after the plugins and route middleware, so a rewrite has already re-resolved
 * the route by the time it runs. Lets the client load a rewrite target it can't match by itself.
 */
export function routeResolveHandler(): RequestHandler {
  return (requestEv: RequestEvent) => {
    if (!requestEv.sharedMap.has(IsQRoute) || requestEv.headersSent || requestEv.exited) {
      return;
    }
    requestEv.headers.set('Cache-Control', 'no-store');
    requestEv.json(200, { p: requestEv.url.pathname });
  };
}
