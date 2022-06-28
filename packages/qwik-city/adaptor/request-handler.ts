import { ROUTE_TYPE_ENDPOINT } from '../runtime/src/library/constants';
import { getRouteParams } from '../runtime/src/library/routing';
import { endpointHandler } from './endpoint-handler';
import type { QwikCityRequestOptions, RenderFunction } from './types';

/**
 * @public
 */
export async function requestHandler(
  renderFn: RenderFunction,
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

function checkRedirect(opts: QwikCityRequestOptions, pathname: string) {
  if (pathname !== '/') {
    if (opts.trailingSlash) {
      // must have a trailing slash
      if (!pathname.endsWith('/')) {
        // add slash to existing pathname
        return createRedirect(opts.url, pathname + '/');
      }
    } else {
      // should not have a trailing slash
      if (pathname.endsWith('/')) {
        // remove slash from existing pathname
        return createRedirect(opts.url, pathname.slice(0, pathname.length - 1));
      }
    }
  }
  return null;
}

function createRedirect(current: URL, updatedPathname: string) {
  // node-fetch has issues with Response.redirect()
  // so just create it manually
  if (updatedPathname !== current.pathname) {
    return new Response(null, {
      status: 308,
      headers: {
        location: updatedPathname + current.search,
      },
    });
  }
  return null;
}

const ENDPOINT_MODULES = new WeakMap<any, any>();
