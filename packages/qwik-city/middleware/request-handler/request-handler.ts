import type { Render } from '@builder.io/qwik/server';
import type { QwikSerializer, ServerRenderOptions, ServerRequestEvent } from './types';
import type { QwikCityPlan } from '../../runtime/src/types';
import { getRouteMatchPathname, type QwikCityRun, runQwikCity } from './user-response';
import { renderQwikMiddleware, resolveRequestHandlers } from './resolve-request-handlers';
import { loadRoute } from '../../runtime/src/routing';

/** @public */
export async function requestHandler<T = unknown>(
  serverRequestEv: ServerRequestEvent<T>,
  opts: ServerRenderOptions,
  qwikSerializer: QwikSerializer
): Promise<QwikCityRun<T> | null> {
  const { render, qwikCityPlan, manifest, checkOrigin } = opts;
  const pathname = serverRequestEv.url.pathname;
  const matchPathname = getRouteMatchPathname(pathname, qwikCityPlan.trailingSlash);
  const route = await loadRequestHandlers(
    qwikCityPlan,
    matchPathname,
    serverRequestEv.request.method,
    checkOrigin ?? true,
    render
  );
  if (route) {
    return runQwikCity(
      serverRequestEv,
      route[0],
      route[1],
      manifest,
      qwikCityPlan.trailingSlash,
      qwikCityPlan.basePathname,
      qwikSerializer
    );
  }
  return null;
}

async function loadRequestHandlers(
  qwikCityPlan: QwikCityPlan,
  pathname: string,
  method: string,
  checkOrigin: boolean,
  renderFn: Render
) {
  const { routes, serverPlugins, menus, cacheModules } = qwikCityPlan;
  const route = await loadRoute(routes, menus, cacheModules, pathname);
  const requestHandlers = resolveRequestHandlers(
    serverPlugins,
    route,
    method,
    checkOrigin,
    renderQwikMiddleware(renderFn)
  );
  if (requestHandlers.length > 0) {
    return [route, requestHandlers] as const;
  }
  return null;
}
