import { useContext, useResource$ } from '@builder.io/qwik';
import { isServer } from '@builder.io/qwik/build';
import { RoutesContext } from './constants';
import { loadRoute } from './routing';
import type { HttpMethod, RequestEvent } from './types';
import { useLocation } from './use-functions';

/**
 * @public
 */
export const useEndpoint = <T = unknown>() => {
  const loc = useLocation();
  const routes = useContext(RoutesContext);
  const method: HttpMethod = 'GET';

  return useResource$<T>(async ({ track, cleanup }) => {
    const pathname = track(loc, 'pathname');

    if (isServer) {
      // SSR
      const route = await loadRoute(routes, pathname);
      if (!route || !Array.isArray(route.modules) || route.modules.length === 0) {
        throw new Error(`Endpoint not found for "${pathname}"`);
      }

      const endpointModule = route.modules[route.modules.length - 1];

      const reqHandler = endpointModule.onGet || endpointModule.onRequest;
      if (typeof reqHandler !== 'function') {
        throw new Error(`Endpoint does not have a ${method} request handler for "${pathname}"`);
      }

      const url = new URL(loc.href);
      const request = new Request(url.href, {
        method,
      });
      const requestEv: RequestEvent = {
        method,
        request,
        url,
        params: { ...route.params },
      };
      const ssrResponse = await reqHandler(requestEv);
      return ssrResponse.body;
    } else {
      // Client
      const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
      cleanup(() => controller && controller.abort());

      const clientRequest = await fetch(pathname, {
        method,
        headers: {
          accept: 'application/json',
        },
        signal: controller && controller.signal,
      });
      const clientData = await clientRequest.json();
      return clientData;
    }
  });
};
