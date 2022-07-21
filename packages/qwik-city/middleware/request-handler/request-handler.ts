import { loadRoute } from '../../runtime/src/library/routing';
import { endpointHandler, getEndpointResponse } from './endpoint-handler';
import { checkPageRedirect } from './redirect-handler';
import type { QwikCityRequestOptions } from './types';
import type { Render } from '@builder.io/qwik/server';
import type { HttpMethod } from '../../runtime/src/library/types';
import { pageHandler } from './page-handler';
import { isAcceptJsonOnly } from './utils';
import { ROUTE_TYPE_ENDPOINT } from '../../runtime/src/library/constants';

/**
 * @public
 */
export async function requestHandler(
  render: Render,
  opts: QwikCityRequestOptions
): Promise<Response | null> {
  try {
    const { request, routes, menus, cacheModules, trailingSlash } = opts;
    const url = new URL(request.url);
    const method: HttpMethod = request.method as any;
    const pathname = url.pathname;

    const loadedRoute = await loadRoute(routes, menus, cacheModules, pathname);
    if (loadedRoute) {
      const { mods, params, route } = loadedRoute;
      const isEndpoint = route[3] === ROUTE_TYPE_ENDPOINT;

      if (!isEndpoint) {
        // content page, so check if the trailing slash should be fixed
        const redirectResponse = checkPageRedirect(url, request.headers, trailingSlash);
        if (redirectResponse) {
          // add or remove the trailing slash depending on the option
          return redirectResponse;
        }
      }

      // build endpoint response from each module in the hierarchy
      const endpointResponse = await getEndpointResponse(request, method, url, params, mods);

      if (endpointResponse.immediateCommitToNetwork) {
        // do not continue and immediately commit the response to the network
        // could be a redirect or error
        return new Response(endpointResponse.body, {
          status: endpointResponse.status,
          headers: endpointResponse.headers,
        });
      }

      if (isEndpoint || isAcceptJsonOnly(request)) {
        // this can only be an endpoint response and not a page
        return endpointHandler(method, endpointResponse);
      }

      // render the page
      const pageResponse = await pageHandler(render, url, params, method, endpointResponse);
      return pageResponse;
    }
  } catch (e: any) {
    return new Response(String(e ? e.stack || e : 'Request Handler Error'), {
      status: 500,
      headers: {
        'content-Type': 'text/plain; charset=utf-8',
      },
    });
  }

  return null;
}
