import type {
  RequestEvent,
  ServerRenderOptions,
  ServerRequestEvent,
  UserResponseContext,
} from './types';
import { getRouteMatchPathname, loadUserResponse } from './user-response';
import { loadRoute } from '../../runtime/src/routing';
import { responsePage } from './response-page';
import { responseQData } from './response-q-data';
import type { Render } from '@builder.io/qwik/server';
import type { RenderOptions } from '@builder.io/qwik';

export async function renderQwikMiddleware(render: Render, opts?: RenderOptions) {
  return async (requestEv: RequestEvent, userResponseCtx: UserResponseContext) => {
    const isPageModule = isLastModulePageRout(routeModules);
    const isPageDataReq = isPageModule && pathname.endsWith(QDATA_JSON);
    if (userResponseCtx.type === 'pagedata') {
      return responseQData(requestEv);
    } else {
      return responsePage(requestEv, render, opts);
    }
  };
}
/**
 * @alpha
 */
export async function requestHandler<T = unknown>(
  serverRequestEv: ServerRequestEvent<T>,
  opts: ServerRenderOptions
): Promise<T | null> {
  const { render, qwikCityPlan } = opts;
  const { routes, menus, cacheModules, trailingSlash, basePathname } = qwikCityPlan;

  const matchPathname = getRouteMatchPathname(serverRequestEv.url.pathname, trailingSlash);
  const loadedRoute = await loadRoute(routes, menus, cacheModules, matchPathname);
  if (loadedRoute) {
    // found and loaded the route for this pathname
    const [params, mods] = loadedRoute;

    // build endpoint response from each module in the hierarchy
    return loadUserResponse<T>(serverRequestEv, params, mods, trailingSlash, basePathname);
  }
  return null;
}
