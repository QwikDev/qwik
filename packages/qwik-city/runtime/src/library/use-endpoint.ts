import { useResource$ } from '@builder.io/qwik';
import { useLocation, useQwikCityEnv } from './use-functions';
import { isServer } from '@builder.io/qwik/build';
import type { ClientPageData, GetEndpointData } from './types';
import { getClientEndpointPath } from './client-navigation';
import type { QPrefetchData } from './service-worker/types';
import { cacheModules } from '@qwik-city-plan';

/**
 * @alpha
 */
export const useEndpoint = <T = unknown>() => {
  const loc = useLocation();
  const env = useQwikCityEnv();

  return useResource$<GetEndpointData<T>>(async ({ track }) => {
    const pathname = track(loc, 'pathname');

    if (isServer) {
      if (!env) {
        throw new Error('Endpoint response body is missing');
      }
      return env.response.body;
    } else {
      // fetch() for new data when the pathname has changed
      const clientData = await loadClientData(sessionStorage, pathname, loc);
      return clientData && clientData.body;
    }
  });
};

const pendingClientDataFetch = new Map<string, Promise<ClientPageData | null>>();

export const loadClientData = async (
  qSession: Storage,
  pathname: string,
  baseUrl: { href: string }
) => {
  const endpointUrl = getClientEndpointPath(pathname, baseUrl);
  const now = Date.now();
  const expiration = cacheModules ? 600000 : 10000;

  let pendingFetch = pendingClientDataFetch.get(endpointUrl);
  if (!pendingFetch) {
    const cachedClientDataResponse: CachedClientDataResponse | null = JSON.parse(
      qSession.getItem(endpointUrl) || 'null'
    );

    if (cachedClientDataResponse && cachedClientDataResponse.t + expiration > now) {
      // we already cached the data and it hasn't expired yet
      return cachedClientDataResponse.c;
    }

    pendingFetch = new Promise<any>((resolve) => {
      fetch(endpointUrl).then(
        (clientResponse) => {
          const contentType = clientResponse.headers.get('content-type') || '';
          if (clientResponse.ok && contentType.includes('json')) {
            clientResponse.json().then(
              (clientData: ClientPageData) => {
                const prefetchData: QPrefetchData = { links: clientData.prefetch };
                const cachedClientDataResponse: CachedClientDataResponse = {
                  c: clientData,
                  t: now,
                };

                dispatchEvent(new CustomEvent('qprefetch', { detail: prefetchData }));

                if (qSession.length > 100) {
                  qSession.clear();
                }
                qSession.setItem(endpointUrl, JSON.stringify(cachedClientDataResponse));

                resolve(clientData);
              },
              () => resolve(null)
            );
          } else {
            resolve(null);
          }
        },
        () => resolve(null)
      );
    }).finally(() => pendingClientDataFetch.delete(endpointUrl));

    pendingClientDataFetch.set(endpointUrl, pendingFetch);
  }

  return pendingFetch;
};

type CachedClientDataResponse = { c: ClientPageData; t: number };
