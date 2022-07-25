import { loadRoute } from '../../runtime/src/library/routing';
import { loadEndpointResponse } from './endpoint-handler';
import type { QwikCityRequestContext } from './types';
import { ROUTE_TYPE_ENDPOINT } from '../../runtime/src/library/constants';
import { checkPageRedirect } from './redirect-handler';
import type { RenderToStringResult, StreamWriter } from '@builder.io/qwik/server';
import { getQwikCityUserContext } from './utils';

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

      if (!isEndpointOnly) {
        // content page, so check if the trailing slash should be redirected
        const redirectResponse = checkPageRedirect(url, trailingSlash, response);
        if (redirectResponse) {
          // page redirect will add or remove the trailing slash depending on the option
          return redirectResponse;
        }
      }

      // build endpoint response from each module in the hierarchy
      const userResponseContext = await loadEndpointResponse(
        request,
        url,
        params,
        mods,
        isEndpointOnly
      );

      if (userResponseContext.handler === 'page') {
        return response(userResponseContext.status, userResponseContext.headers, async (stream) => {
          const result = await render({
            stream,
            url: url.href,
            userContext: getQwikCityUserContext(userResponseContext),
          });
          if (result && (typeof result as any as RenderToStringResult).html === 'string') {
            stream.write((result as any as RenderToStringResult).html);
          }
        });
      }

      if (userResponseContext.handler === 'endpoint') {
        return response(
          userResponseContext.status,
          userResponseContext.headers,
          async (stream: StreamWriter) => {
            stream.write(userResponseContext.body);
          }
        );
      }
    }
  } catch (e: any) {
    return response(
      500,
      new URLSearchParams({ 'Content-Type': 'text/plain; charset=utf-8' }),
      async (stream: StreamWriter) => {
        stream.write(String(e ? e.stack || e : 'Request Handler Error'));
      }
    );
  }

  return requestCtx.next();
}
