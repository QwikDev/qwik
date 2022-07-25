import { loadRoute } from '../../runtime/src/library/routing';
import { loadEndpointResponse } from './endpoint-handler';
import type { QwikCityRequestContext } from './types';
import { ROUTE_TYPE_ENDPOINT } from '../../runtime/src/library/constants';
import { getQwikCityUserContext } from './utils';
import { checkPageRedirect } from './redirect-handler';

/**
 * @public
 */
export async function requestHandler(requestCtx: QwikCityRequestContext): Promise<void> {
  const { routes, menus, cacheModules, trailingSlash, request, response, url, render } = requestCtx;

  try {
    const loadedRoute = await loadRoute(routes, menus, cacheModules, url.pathname);
    if (loadedRoute) {
      // found and loaded the route for this pathname
      const { mods, params, route } = loadedRoute;
      const isEndpointOnly = route[3] === ROUTE_TYPE_ENDPOINT;

      if (!isEndpointOnly) {
        // content page, so check if the trailing slash should be redirected
        checkPageRedirect(url, response, trailingSlash);
        if (response.handled) {
          // page redirect will add or remove the trailing slash depending on the option
          return;
        }
      }

      // build endpoint response from each module in the hierarchy
      await loadEndpointResponse(request, response, url, params, mods, isEndpointOnly);

      if (!response.handled) {
        // not an endpoint only response
        // render the page
        response.handled = true;

        // for the page, the endpointResponse data is a value, not a stream
        if (!response.headers.has('Content-Type')) {
          response.headers.set('Content-Type', 'text/html; charset=utf-8');
        }

        render({
          stream: response,
          url: url.href,
          userContext: getQwikCityUserContext(url, params, response),
        }).then((result) => {
          if ('html' in result) {
            response.write((result as any).html);
          }
        });
      }
    }
  } catch (e: any) {
    response.status(500);
    response.headers.set('Content-Type', 'text/plain; charset=utf-8');
    response.write(String(e ? e.stack || e : 'Request Handler Error'));
    response.handled = true;
  }
}
