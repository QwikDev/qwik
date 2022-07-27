import { loadRoute } from '../../runtime/src/library/routing';
import { loadUserResponse } from './user-response';
import type { QwikCityRequestContext } from './types';
import { ROUTE_TYPE_ENDPOINT } from '../../runtime/src/library/constants';
import type { RenderToStringResult } from '@builder.io/qwik/server';
import { getQwikCityUserContext } from './utils';
import { errorResponse, notFoundResponse } from './fallback-handler';

/**
 * @public
 */
export async function requestHandler<T = any>(requestCtx: QwikCityRequestContext): Promise<T> {
  const { routes, menus, cacheModules, trailingSlash, request, response, url, render } = requestCtx;

  try {
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

      // page response
      return response(userResponse.status, userResponse.headers, async (stream) => {
        const result = await render({
          stream,
          url: url.href,
          userContext: getQwikCityUserContext(userResponse),
        });
        if ((typeof result as any as RenderToStringResult).html === 'string') {
          stream.write((result as any as RenderToStringResult).html);
        }
      });
    }

    return notFoundResponse(response);
  } catch (e: any) {
    return errorResponse(e, response);
  }
}
