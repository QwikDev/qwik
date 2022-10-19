import { loadRoute } from '../../runtime/src/library/routing';
import { loadUserResponse, updateRequestCtx } from './user-response';
import type { QwikCityRequestContext, QwikCityHandlerOptions } from './types';
import { errorHandler, ErrorResponse, errorResponse } from './error-handler';
import { endpointHandler } from './endpoint-handler';
import { pageHandler } from './page-handler';
import { RedirectResponse, redirectResponse } from './redirect-handler';

/**
 * @alpha
 */
export async function requestHandler<T = any>(
  requestCtx: QwikCityRequestContext,
  opts: QwikCityHandlerOptions
): Promise<T | null> {
  try {
    const { render, qwikCityPlan } = opts;
    const { routes, menus, cacheModules, trailingSlash, basePathname } = qwikCityPlan;
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
        trailingSlash,
        basePathname
      );
      if (userResponse.aborted) {
        return null;
      }

      // status and headers should be immutable in at this point
      // body may not have resolved yet
      if (userResponse.type === 'endpoint') {
        const endpointResult = await endpointHandler(requestCtx, userResponse);
        return endpointResult;
      }

      const pageResult = await pageHandler(
        requestCtx,
        userResponse,
        render,
        opts,
        routeBundleNames
      );
      return pageResult;
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
