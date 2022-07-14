import { ROUTE_TYPE_ENDPOINT } from '../../runtime/src/library/constants';
import { getRouteParams } from '../../runtime/src/library/routing';
import { endpointHandler, getEndpointResponse } from './endpoint-handler';
import { checkEndpointRedirect, checkPageRedirect } from './redirect-handler';
import type { QwikCityRequestOptions } from './types';
import type { Render } from '@builder.io/qwik/server';
import type { HttpMethod } from '../../runtime/src/library/types';
import { pageHandler } from './page-handler';
import { isAcceptJsonOnly } from './utils';

/**
 * @public
 */
export async function requestHandler(
  render: Render,
  opts: QwikCityRequestOptions
): Promise<Response | null> {
  if (Array.isArray(opts.routes)) {
    try {
      const { request } = opts;
      const url = new URL(request.url);
      const pathname = url.pathname;

      for (const route of opts.routes) {
        const pattern = route[0];
        const match = pattern.exec(pathname);

        if (match) {
          const routeType = route[3];

          if (routeType !== ROUTE_TYPE_ENDPOINT) {
            const redirectResponse = checkPageRedirect(url, request.headers, opts.trailingSlash);
            if (redirectResponse) {
              // add or remove the trailing slash depending on the option
              return redirectResponse;
            }
          }

          const moduleLoaders = route[1];
          const paramNames = route[2];
          const method: HttpMethod = request.method as any;
          const params = getRouteParams(paramNames, match);
          const endpointLoader = moduleLoaders[moduleLoaders.length - 1];
          const endpointModule = await endpointLoader();

          const endpointResponse = await getEndpointResponse(
            request,
            method,
            url,
            params,
            endpointModule
          );

          const endpointRedirectResponse = checkEndpointRedirect(endpointResponse);
          if (endpointRedirectResponse) {
            return endpointRedirectResponse;
          }

          if (routeType === ROUTE_TYPE_ENDPOINT || isAcceptJsonOnly(request)) {
            return endpointHandler(method, endpointResponse);
          }

          const pageResponse = await pageHandler(render, url, params, method, endpointResponse);
          return pageResponse;
        }
      }
    } catch (e) {
      return new Response(`Error: ${String(e)}`, {
        status: 500,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });
    }
  }

  return null;
}
