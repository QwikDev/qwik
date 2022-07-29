import { loadRoute } from '../../runtime/src/library/routing';
import { loadUserResponse } from './user-response';
import type { QwikCityRequestContext, QwikCityRequestOptions } from './types';
import { ROUTE_TYPE_ENDPOINT } from '../../runtime/src/library/constants';
import type { Render, RenderToStringResult } from '@builder.io/qwik/server';
import { getQwikCityUserContext } from './utils';
import { errorResponse, notFoundResponse } from './fallback-handler';

/**
 * @public
 */
export async function requestHandler<T = any>(
  requestCtx: QwikCityRequestContext,
  render: Render,
  opts: QwikCityRequestOptions
): Promise<T> {
  const { request, response, url } = requestCtx;

  try {
    const { routes, menus, cacheModules, trailingSlash } = opts;
    const loadedRoute = await loadRoute(routes, menus, cacheModules, url.pathname);
    if (loadedRoute) {
      // found and loaded the route for this pathname
      const { mods, params, route } = loadedRoute;
      const isEndpointOnly = route[3] === ROUTE_TYPE_ENDPOINT;

      // build endpoint response from each module in the hierarchy
      const userResponse = await loadUserResponse(
        request,
        url,
        params,
        mods,
        trailingSlash,
        isEndpointOnly
      );

      if (userResponse.type === 'endpoint') {
        // endpoint response
        return response(userResponse.status, userResponse.headers, async (stream) => {
          if (typeof userResponse.body === 'string') {
            stream.write(userResponse.body);
          }
        });
      }

      // User-assigned 404 response
      if (userResponse.status === 404) {
        return notFoundResponse(response, userResponse.headers);
      }

      // page response
      return response(userResponse.status, userResponse.headers, async (stream) => {
        const result = await render({
          stream,
          url: url.href,
          userContext: getQwikCityUserContext(userResponse),
          ...opts,
        });
        if ((typeof result as any as RenderToStringResult).html === 'string') {
          stream.write((result as any as RenderToStringResult).html);
        }
      });
    }

    // Route not found 404
    return notFoundResponse(response);
  } catch (e: any) {
    return errorResponse(e, response);
  }
}
