import { ROUTE_TYPE_ENDPOINT } from '../../runtime/src/library/constants';
import { getRouteParams } from '../../runtime/src/library/routing';
import { endpointHandler } from './endpoint-handler';
import { checkRedirect } from './redirect-handler';
import type { QwikCityRequestOptions } from './types';
import type { Render } from '@builder.io/qwik/server';

/**
 * @public
 */
export async function requestHandler(
  render: Render,
  opts: QwikCityRequestOptions
): Promise<Response | null> {
  if (Array.isArray(opts.routes)) {
    const pathname = opts.url.pathname;

    for (const route of opts.routes) {
      const pattern = route[0];

      const match = pattern.exec(pathname);
      if (match) {
        const routeType = route[3];

        const redirectResponse = checkRedirect(opts, pathname);
        if (redirectResponse) {
          return redirectResponse;
        }

        if (routeType === ROUTE_TYPE_ENDPOINT) {
          const moduleLoaders = route[1];
          const endpointLoader = moduleLoaders[moduleLoaders.length - 1];

          let endpointModule = ENDPOINT_MODULES.get(endpointLoader);
          if (!endpointModule) {
            endpointModule = await endpointLoader();
            ENDPOINT_MODULES.set(endpointLoader, endpointModule);
          }

          const paramNames = route[2];
          const params = getRouteParams(paramNames, match);
          return endpointHandler(opts.request, opts.url, params, endpointModule);
        }

        const result = await render(opts);

        return new Response(result.html, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
          },
        });
      }
    }
  }

  return null;
}

const ENDPOINT_MODULES = new WeakMap<any, any>();
