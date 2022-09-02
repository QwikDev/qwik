import { loadRoute } from '../../runtime/src/library/routing';
import { loadUserResponse, updateRequestCtx } from './user-response';
import type { QwikCityRequestContext, QwikCityRequestOptions } from './types';
import type { Render } from '@builder.io/qwik/server';
import { errorHandler, ErrorResponse, errorResponse } from './error-handler';
import { routes, menus, cacheModules, trailingSlash, basePathname } from '@qwik-city-plan';
import { endpointHandler } from './endpoint-handler';
import { pageHandler } from './page-handler';
import { RedirectResponse, redirectResponse } from './redirect-handler';

/**
 * @alpha
 */
export async function requestHandler<T = any>(
  requestCtx: QwikCityRequestContext,
  render: Render,
  platform: Record<string, any>,
  opts?: QwikCityRequestOptions
): Promise<T | null> {
  try {
    updateRequestCtx(requestCtx, trailingSlash);

    const loadedRoute = await loadRoute(routes, menus, cacheModules, requestCtx.url.pathname);
    if (loadedRoute) {
      // found and loaded the route for this pathname
      const [params, mods, _, routeBundleNames] = loadedRoute;

      // build endpoint response from each module in the hierarchy
      const userResponse = await loadUserResponse(
        requestCtx,
        params,
        mods,
        platform,
        trailingSlash,
        basePathname
      );

      // status and headers should be immutable in at this point
      // body may not have resolved yet
      if (userResponse.type === 'endpoint') {
        return endpointHandler(requestCtx, userResponse);
      }

      return pageHandler(requestCtx, userResponse, render, opts, routeBundleNames);
    }
  } catch (e: any) {
    if (e instanceof RedirectResponse) {
      return redirectResponse(requestCtx, e);
    }
    if (e instanceof ErrorResponse) {
      return errorResponse(requestCtx, e);
    }
    return errorHandler(requestCtx, e);
  }

  // route not found, return null so other server middlewares
  // have the chance to handle this request
  return null;
}
