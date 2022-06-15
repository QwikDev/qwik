import type { QwikCityRequestOptions } from './types';
// import { ROUTE_TYPE_ENDPOINT } from '../runtime/constants';
// import { endpointHandler } from './endpoint-handler';
// import { getRouteParams } from '../runtime/routing';
// import { pageHandler } from './page-handler';
import { renderToString } from '@builder.io/qwik/server';

/**
 * @public
 */
export async function requestHandler(root: any, opts: QwikCityRequestOptions) {
  // const pathname = opts.url.pathname;

  const result = await renderToString(root, opts);

  return new Response(result.html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });

  // for (const route of opts.routes) {
  //   const pattern = route[0];

  //   const match = pattern.exec(pathname);
  //   if (match) {
  //     const routeType = route[3];

  //     if (routeType === ROUTE_TYPE_ENDPOINT) {
  //       const moduleLoaders = route[1];
  //       const endpointLoader = moduleLoaders[moduleLoaders.length - 1];

  //       let endpointModule = ENDPOINT_MODULES.get(endpointLoader);
  //       if (!endpointModule) {
  //         endpointModule = await endpointLoader();
  //         ENDPOINT_MODULES.set(endpointLoader, endpointModule);
  //       }

  //       const paramNames = route[2];
  //       const params = getRouteParams(paramNames, match);
  //       return endpointHandler(opts.request, opts.url, params, endpointModule);
  //     }

  //     return pageHandler(root, opts);
  //   }
  // }

  // return null;
}

// const ENDPOINT_MODULES = new WeakMap<any, any>();
