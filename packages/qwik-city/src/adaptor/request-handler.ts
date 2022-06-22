import { ROUTE_TYPE_ENDPOINT } from '../runtime/constants';
import { getRouteParams } from '../runtime/routing';
import { endpointHandler } from './endpoint-handler';
import type { QwikCityRequestOptions, RenderFunction } from './types';

/**
 * @public
 */
export async function requestHandler(renderFn: RenderFunction, opts: QwikCityRequestOptions) {
  if (Array.isArray(opts.routes)) {
    const pathname = opts.url.pathname;

    for (const route of opts.routes) {
      const pattern = route[0];

      const match = pattern.exec(pathname);
      if (match) {
        const routeType = route[3];

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

        const result = await renderFn(opts);

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
