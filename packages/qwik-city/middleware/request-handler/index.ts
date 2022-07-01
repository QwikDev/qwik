import { ROUTE_TYPE_ENDPOINT } from '../../runtime/src/library/constants';
import { getRouteParams } from '../../runtime/src/library/routing';
import { endpointHandler } from './endpoint-handler';
import { checkRedirect } from './redirect-handler';
import type { QwikCityRequestOptions } from './types';
import type { Render } from '@builder.io/qwik/server';
import type { RequestEvent } from '../../runtime/src/library/types';

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
        const paramNames = route[2];
        const params = getRouteParams(paramNames, match);

        const requestEv: RequestEvent = { method: request.method, request, url, params };

        if (routeType === ROUTE_TYPE_ENDPOINT) {
          const moduleLoaders = route[1];
          const endpointLoader = moduleLoaders[moduleLoaders.length - 1];

          let endpointModule = ENDPOINT_MODULES.get(endpointLoader);
          if (!endpointModule) {
            endpointModule = await endpointLoader();
            ENDPOINT_MODULES.set(endpointLoader, endpointModule);
          }

          return endpointHandler(requestEv, endpointModule);
        }

        const redirectResponse = checkRedirect(url, opts.trailingSlash);
        if (redirectResponse) {
          return redirectResponse;
        }

        // do not using caching during development
        const useCache = url.hostname !== 'localhost' && request.method === 'GET';

        const result = await render({ url: url.href });

        return new Response(result.html, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': useCache
              ? `max-age=120, s-maxage=60, stale-while-revalidate=604800, stale-if-error=604800`
              : `no-cache, max-age=0, no-store`,
          },
        });
      }
    }
  }

  return null;
}

const ENDPOINT_MODULES = new WeakMap<any, any>();
