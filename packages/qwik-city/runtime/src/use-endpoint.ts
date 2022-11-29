import { useResource$ } from '@builder.io/qwik';
import { useLocation, useQwikCityEnv } from './use-functions';
import { isServer } from '@builder.io/qwik/build';
import type { GetEndpointData } from './types';
import { getClientDataPath } from './utils';
import { dispatchPrefetchEvent } from './client-navigate';
import { CLIENT_DATA_CACHE } from './constants';

/**
 * @alpha
 */
export const useEndpoint = <T = unknown>() => {
  const loc = useLocation();
  const env = useQwikCityEnv();

  return useResource$<GetEndpointData<T>>(async ({ track }) => {
    const href = track(() => loc.href);

    if (isServer) {
      if (!env) {
        throw new Error('Endpoint response body is missing');
      }
      return env.response.body;
    } else {
      // fetch() for new data when the pathname has changed
      const clientData = await loadClientData(href, true);
      return clientData && clientData.body;
    }
  });
};

export const loadClientData = async (href: string, clearCache?: boolean) => {
  const url = new URL(href);
  const pagePathname = url.pathname;
  const pageSearch = url.search;
  const clientDataPath = getClientDataPath(pagePathname, pageSearch);
  let qData = CLIENT_DATA_CACHE.get(clientDataPath);

  dispatchPrefetchEvent({
    links: [pagePathname],
  });

  if (!qData) {
    qData = fetch(clientDataPath).then((rsp) => {
      if (rsp.ok && (rsp.headers.get('content-type') || '').includes('json')) {
        return rsp.json().then((clientData) => {
          dispatchPrefetchEvent({
            bundles: clientData.prefetch,
          });
          if (clearCache) {
            CLIENT_DATA_CACHE.delete(clientDataPath);
          }
          return clientData;
        });
      } else {
        CLIENT_DATA_CACHE.delete(clientDataPath);
      }
    });

    CLIENT_DATA_CACHE.set(clientDataPath, qData);
  }

  return qData;
};
