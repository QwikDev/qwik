import { ROUTE_TYPE_ENDPOINT } from '../../runtime/src/library/constants';
import { getRouteParams } from '../../runtime/src/library/routing';
import { endpointHandler } from './endpoint-handler';
import { checkRedirect } from './redirect-handler';
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
    const { request } = opts;
    const url = new URL(request.url);
    const pathname = url.pathname;

    for (const route of opts.routes) {
      const pattern = route[0];
      const match = pattern.exec(pathname);

      if (match) {
        const routeType = route[3];
        const method: HttpMethod = request.method as any;

        if (routeType === ROUTE_TYPE_ENDPOINT || isAcceptJsonOnly(request)) {
          const moduleLoaders = route[1];
          const paramNames = route[2];
          const params = getRouteParams(paramNames, match);
          const endpointLoader = moduleLoaders[moduleLoaders.length - 1];
          const endpointModule = await endpointLoader();

          const endpointResopnse = await endpointHandler(
            request,
            method,
            url,
            params,
            endpointModule
          );
          return endpointResopnse;
        }

        const redirectResponse = checkRedirect(url, opts.trailingSlash);
        if (redirectResponse) {
          return redirectResponse;
        }

        const pageResponse = await pageHandler(render, method, url);
        return pageResponse;
      }
    }
  }

  return null;
}
