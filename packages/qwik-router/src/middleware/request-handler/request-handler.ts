import type { Render } from '@qwik.dev/core/server';
import { loadRoute } from '../../runtime/src/routing';
import type { QwikRouterConfig } from '../../runtime/src/types';
import { renderQwikMiddleware, resolveRequestHandlers } from './resolve-request-handlers';
import type { QwikSerializer, ServerRenderOptions, ServerRequestEvent } from './types';
import { getRouteMatchPathname, runQwikRouter, type QwikRouterRun } from './user-response';
import qwikRouterConfig from '@qwik-router-config';
import render from '../../render-ssr';
import { manifest } from '@qwik-client-manifest';

/**
 * The request handler for QwikRouter. Called by every integration.
 *
 * @public
 */
export async function requestHandler<T = unknown>(
  serverRequestEv: ServerRequestEvent<T>,
  opts: ServerRenderOptions,
  qwikSerializer: QwikSerializer
): Promise<QwikRouterRun<T> | null> {
  const { checkOrigin } = opts;
  const pathname = serverRequestEv.url.pathname;
  const matchPathname = getRouteMatchPathname(pathname, qwikRouterConfig.trailingSlash);
  const routeAndHandlers = await loadRequestHandlers(
    qwikRouterConfig,
    matchPathname,
    serverRequestEv.request.method,
    checkOrigin ?? true,
    render
  );
  if (routeAndHandlers) {
    const [route, requestHandlers] = routeAndHandlers;
    return runQwikRouter(
      serverRequestEv,
      route,
      requestHandlers,
      manifest,
      qwikRouterConfig.trailingSlash,
      qwikRouterConfig.basePathname,
      qwikSerializer
    );
  }
  return null;
}

async function loadRequestHandlers(
  qwikRouterConfig: QwikRouterConfig,
  pathname: string,
  method: string,
  checkOrigin: boolean,
  renderFn: Render
) {
  const { routes, serverPlugins, menus, cacheModules } = qwikRouterConfig;
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
