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
      const clientData = await loadClientData(pathname, loc);
      return clientData && clientData.body;
    }
  });
};

export const loadClientData = async (pathname: string, baseUrl: { href: string }) => {
  const endpointUrl = getClientEndpointPath(pathname, baseUrl);
  const now = Date.now();
  const expiration = cacheModules ? 600000 : 15000;

  const cachedClientPageIndex = cachedClientPages.findIndex((c) => c.u === endpointUrl);
  let cachedClientPageData = cachedClientPages[cachedClientPageIndex];

  if (!cachedClientPageData || cachedClientPageData.t + expiration < now) {
    cachedClientPageData = {
      u: endpointUrl,
      t: now,
      c: new Promise<ClientPageData | null>((resolve) => {
        fetch(endpointUrl).then(
          (clientResponse) => {
            const contentType = clientResponse.headers.get('content-type') || '';
            if (clientResponse.ok && contentType.includes('json')) {
              clientResponse.json().then(
                (clientData: ClientPageData) => {
                  const prefetchData: QPrefetchData = {
                    bundles: clientData.prefetch,
                  };
                  dispatchEvent(new CustomEvent('qprefetch', { detail: prefetchData }));
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
      }),
    };

    for (let i = cachedClientPages.length - 1; i >= 0; i--) {
      if (cachedClientPages[i].t + expiration < now) {
        cachedClientPages.splice(i, 1);
      }
    }
    cachedClientPages.push(cachedClientPageData);
  }

  return cachedClientPageData.c;
};

const cachedClientPages: CachedClientPageData[] = [];

interface CachedClientPageData {
  c: Promise<ClientPageData | null>;
  t: number;
  u: string;
}
