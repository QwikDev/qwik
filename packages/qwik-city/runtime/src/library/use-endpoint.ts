import { useResource$ } from '@builder.io/qwik';
import { useLocation, useQwikCityEnv } from './use-functions';
import { isServer } from '@builder.io/qwik/build';
import type { ClientPageData, GetEndpointData } from './types';
import { getClientEndpointPath } from './client-navigation';
import { buildId } from '@qwik-city-plan';

/**
 * @alpha
 */
export const useEndpoint = <T = unknown>() => {
  const loc = useLocation();
  const env = useQwikCityEnv();

  return useResource$<GetEndpointData<T>>(async ({ track, cleanup }) => {
    const pathname = track(loc, 'pathname');

    if (isServer) {
      if (!env) {
        throw new Error('Endpoint response body is missing');
      }
      return env.response.body;
    } else {
      // fetch() for new data when the pathname has changed
      const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
      cleanup(() => controller && controller.abort());

      const endpointUrl = getClientEndpointPath(pathname, buildId);
      const clientResponse = await fetch(endpointUrl, {
        signal: controller && controller.signal,
      });

      const contentType = clientResponse.headers.get('content-type') || '';

      if (clientResponse.ok && contentType.includes('json')) {
        const clientData: ClientPageData = await clientResponse.json();
        return clientData.data as T;
      }

      throw new Error(`Invalid endpoint response: ${clientResponse.status}, ${contentType}`);
    }
  });
};
