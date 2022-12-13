import type {
  RequestEvent,
  ServerRenderOptions,
  ServerRequestEvent,
  UserResponseContext,
} from './types';
import { ErrorResponse, errorResponse } from './error-handler';
import { getRouteMatchPathname, loadUserResponse } from './user-response';
import { loadRoute } from '../../runtime/src/routing';
import { RedirectResponse, redirectResponse } from './redirect-handler';
import { getQwikCityEnvData, responsePage } from './response-page';
import { responseQData } from './response-q-data';
import { responseEndpoint } from './response-endpoint';
import type { Render } from '@builder.io/qwik/server';
import type { RenderOptions } from '@builder.io/qwik';

export async function renderQwikMiddleware(render: Render, opts?: RenderOptions) {
  return async (
    request: RequestEvent,
    userResponseCtx: UserResponseContext,
    serverRequestEv: ServerRequestEvent
  ) => {
    const requestHeaders: Record<string, string> = {};
    serverRequestEv.request.headers.forEach((value, key) => (requestHeaders[key] = value));

    const result = await render({
      stream: request.stream,
      envData: getQwikCityEnvData(
        requestHeaders,
        matchPathname,
        userResponseCtx,
        serverRequestEv.mode
      ),
      ...opts,
    });
  };
}
/**
 * @alpha
 */
export async function requestHandler<T = unknown>(
  serverRequestEv: ServerRequestEvent<T>,
  opts: ServerRenderOptions
): Promise<T | null> {
  try {
    const { render, qwikCityPlan } = opts;
    const { routes, menus, cacheModules, trailingSlash, basePathname } = qwikCityPlan;

    const matchPathname = getRouteMatchPathname(serverRequestEv.url.pathname, trailingSlash);
    const loadedRoute = await loadRoute(routes, menus, cacheModules, matchPathname);
    if (loadedRoute) {
      // found and loaded the route for this pathname
      const [params, mods] = loadedRoute;

      // build endpoint response from each module in the hierarchy
      const userResponseCtx = await loadUserResponse(
        serverRequestEv,
        params,
        mods,
        trailingSlash,
        basePathname
      );

      if (userResponseCtx.aborted) {
        // response was aborted, early exit
        return null;
      }

      if (userResponseCtx.type === 'endpoint') {
        return responseEndpoint(serverRequestEv, userResponseCtx);
      }

      if (userResponseCtx.type === 'pagedata') {
        return responseQData(serverRequestEv, userResponseCtx);
      }

      return responsePage(serverRequestEv, matchPathname, userResponseCtx, render, opts);
    }
  } catch (e: any) {
    if (e instanceof RedirectResponse) {
      // return redirectResponse(serverRequestEv, e);
    } else if (e instanceof ErrorResponse) {
      // return errorResponse(serverRequestEv, e);
    } else {
      throw e;
    }
  }

  // route not found, return null so other server middlewares
  // have the chance to handle this request
  return null;
}
