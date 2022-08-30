import { useResource$ } from '@builder.io/qwik';
import { useLocation, useQwikCityEnv } from './use-functions';
import { isServer } from '@builder.io/qwik/build';
import type { ClientPageData, GetEndpointData } from './types';
import { getClientEndpointPath } from './client-navigation';
import type { QPrefetchData } from './service-worker/types';

/**
 * @alpha
 */
export const useEndpoint = <T = unknown>() => {
  const loc = useLocation();
  const env = useQwikCityEnv();

  return useResource$<GetEndpointData<T>>(({ track }) => {
    const pathname = track(loc, 'pathname');

    if (isServer) {
      if (!env) {
        throw new Error('Endpoint response body is missing');
      }
      return env.response.body;
    } else {
      // fetch() for new data when the pathname has changed
      return fetchClientData(pathname, loc);
    }
  });
};

const cachedClientDataResponses: { c: Promise<ClientPageData>; t: number; u: string }[] = [];

export const fetchClientData = async (pathname: string, baseUrl: { href: string }) => {
  const endpointUrl = getClientEndpointPath(pathname, baseUrl);
  const i = cachedClientDataResponses.findIndex((cached) => cached.u === endpointUrl);
  const now = Date.now();
  let cachedClientDataResponse = cachedClientDataResponses[i];

  if (!cachedClientDataResponse || cachedClientDataResponse.t + 300000 < now) {
    cachedClientDataResponse = {
      c: new Promise<ClientPageData>((resolve, reject) => {
        fetch(endpointUrl).then((clientResponse) => {
          try {
            const contentType = clientResponse.headers.get('content-type') || '';
            if (clientResponse.ok && contentType.includes('json')) {
              clientResponse.json().then((clientData: ClientPageData) => {
                const prefetchData: QPrefetchData = { links: clientData.prefetch };
                dispatchEvent(new CustomEvent('qprefetch', { detail: prefetchData }));
                resolve(clientData);
              }, reject);
            } else {
              reject(`Invalid endpoint response: ${clientResponse.status}, ${contentType}`);
            }
          } catch (e) {
            reject(e);
          }
        }, reject);
      }),
      t: now,
      u: endpointUrl,
    };
    if (i > -1) {
      cachedClientDataResponses[i] = cachedClientDataResponse;
    } else {
      cachedClientDataResponses.push(cachedClientDataResponse);
      if (cachedClientDataResponses.length > 30) {
        cachedClientDataResponses.splice(0, cachedClientDataResponses.length - 30);
      }
    }
  }

  const clientPageData = await cachedClientDataResponse.c;

  return clientPageData.data;
};
