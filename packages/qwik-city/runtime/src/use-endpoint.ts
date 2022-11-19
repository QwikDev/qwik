import { useResource$ } from '@builder.io/qwik';
import { useLocation, useQwikCityEnv } from './use-functions';
import { isServer } from '@builder.io/qwik/build';
import type { ClientPageData, GetEndpointData } from './types';
import { getClientEndpointPath } from './utils';
import { dispatchPrefetchEvent } from './client-navigate';

/**
 * @alpha
 */
export const useEndpoint = <T = unknown>() => {
  const loc = useLocation();
  const env = useQwikCityEnv();

  return useResource$<GetEndpointData<T>>(async ({ track }) => {
    const href = track(loc, 'href');

    if (isServer) {
      if (!env) {
        throw new Error('Endpoint response body is missing');
      }
      return env.response.body;
    } else {
      // fetch() for new data when the pathname has changed
      const clientData = await loadClientData(href);
      return clientData && clientData.body;
    }
  });
};

export const loadClientData = async (href: string) => {
  const pagePathname = new URL(href).pathname;
  const endpointUrl = getClientEndpointPath(pagePathname);

  dispatchPrefetchEvent({
    links: [pagePathname],
  });

  const clientResponse = await fetch(endpointUrl);
  const contentType = clientResponse.headers.get('content-type') || '';
  if (clientResponse.ok && contentType.includes('json')) {
    const clientData: ClientPageData = await clientResponse.json();
    dispatchPrefetchEvent({
      bundles: clientData.prefetch,
      links: [pagePathname],
    });
    return clientData;
  }
};
