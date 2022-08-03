import { loadRoute } from '../../runtime/src/library/routing';
import { loadUserResponse } from './user-response';
import type { QwikCityRequestContext, QwikCityRequestOptions } from './types';
import { ROUTE_TYPE_ENDPOINT } from '../../runtime/src/library/constants';
import type { Render } from '@builder.io/qwik/server';
import { errorHandler } from './error-handler';
import cityPlan from '@qwik-city-plan';
import { endpointHandler } from './endpoint-handler';
import { HttpStatus } from './http-status-codes';
import { pageHandler } from './page-handler';

/**
 * @public
 */
export async function requestHandler<T = any>(
  requestCtx: QwikCityRequestContext,
  render: Render,
  opts?: QwikCityRequestOptions
): Promise<T | null> {
  try {
    const pathname = requestCtx.url.pathname;
    const { routes, menus, cacheModules, trailingSlash } = { ...cityPlan, ...opts };
    const loadedRoute = await loadRoute(routes, menus, cacheModules, pathname);
    if (loadedRoute) {
      // found and loaded the route for this pathname
      const { mods, params, route } = loadedRoute;
      const isEndpointOnly = route[3] === ROUTE_TYPE_ENDPOINT;

      // build endpoint response from each module in the hierarchy
      const userResponse = await loadUserResponse(
        requestCtx,
        params,
        mods,
        trailingSlash,
        isEndpointOnly
      );

      // status and headers should be immutable in at this point
      // body may not have resolved yet

      // user-assigned 404 response, return null so other server middlewares
      // have the chance to handle this request
      if (userResponse.status === HttpStatus.NotFound) {
        return null;
      }

      if (userResponse.isEndpointOnly) {
        return endpointHandler(requestCtx, userResponse);
      }

      return pageHandler(requestCtx, userResponse, render, opts);
    }
  } catch (e: any) {
    return errorHandler(requestCtx, e);
  }

  // route not found, return null so other server middlewares
  // have the chance to handle this request
  return null;
}
