import type { RouteData } from '@builder.io/qwik-city';
import type { Render } from '@builder.io/qwik/server';
import type { ServerRenderOptions, ServerRequestEvent } from './types';
import type { MenuData } from '../../runtime/src/types';
import { getErrorHtml } from './error-handler';
import { getRouteMatchPathname, QwikCityRun, runQwikCity } from './user-response';
import { isLastModulePageRoute, resolveRequestHandlers } from './resolve-request-handlers';
import { loadRoute } from '../../runtime/src/routing';
import { renderQData, renderQwikMiddleware } from './render-middleware';

/**
 * @alpha
 */
export async function requestHandler<T = unknown>(
  serverRequestEv: ServerRequestEvent<T>,
  opts: ServerRenderOptions
): Promise<QwikCityRun<T> | null> {
  const { render, qwikCityPlan } = opts;
  const { routes, menus, cacheModules, trailingSlash, basePathname } = qwikCityPlan;
  const pathname = serverRequestEv.url.pathname;
  const matchPathname = getRouteMatchPathname(pathname, trailingSlash);
  const loadedRoute = await loadRequestHandlers(
    routes,
    menus,
    cacheModules,
    matchPathname,
    serverRequestEv.request.method,
    render
  );
  if (loadedRoute) {
    return handleErrors(
      runQwikCity(
        serverRequestEv,
        loadedRoute[0],
        loadedRoute[1],
        loadedRoute[2],
        trailingSlash,
        basePathname
      )
    );
  }
  return null;
}

async function loadRequestHandlers(
  routes: RouteData[] | undefined,
  menus: MenuData[] | undefined,
  cacheModules: boolean | undefined,
  pathname: string,
  method: string,
  renderFn: Render
) {
  const route = await loadRoute(routes, menus, cacheModules, pathname);
  if (route) {
    let isPageRoute = false;
    const requestHandlers = resolveRequestHandlers(route[1], method);
    if (isLastModulePageRoute(route[1])) {
      requestHandlers.unshift(renderQData);
      requestHandlers.push(renderQwikMiddleware(renderFn));
      isPageRoute = true;
    }
    return [route[0], requestHandlers, isPageRoute] as const;
  }
  return null;
}

function handleErrors<T>(run: QwikCityRun<T>): QwikCityRun<T> {
  const requestEv = run.requestEv;
  return {
    response: run.response,
    requestEv: requestEv,
    completion: run.completion
      .then(
        () => {
          if (requestEv.headersSent) {
            requestEv.getWritableStream();
            // TODO
            // if (!stream.locked) {
            //   stream.getWriter().closed
            //   return stream.close();
            // }
          }
        },
        (e) => {
          console.error(e);
          const status = requestEv.status();
          const html = getErrorHtml(status, e);
          if (requestEv.headersSent) {
            const writableStream = requestEv.getWritableStream();
            if (!writableStream.locked) {
              return writableStream.close();
            }
          } else {
            requestEv.html(status, html);
          }
        }
      )
      .then(() => requestEv),
  };
}
