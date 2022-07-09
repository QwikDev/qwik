import { useDocument, useResource$ } from '@builder.io/qwik';
import { isServer } from '@builder.io/qwik/build';
import type { QwikCityRenderDocument } from './types';
import type { HttpMethod } from './types';
import { useLocation } from './use-functions';

/**
 * @public
 */
export const useEndpoint = <T = unknown>() => {
  const loc = useLocation();
  const method: HttpMethod = 'GET';
  const doc = useDocument() as QwikCityRenderDocument;

  return useResource$<T>(async ({ track, cleanup }) => {
    const pathname = track(loc, 'pathname');

    if (isServer) {
      // SSR
      // server has already loaded the data if an endpoint existed for it
      return doc?.__qwikUserCtx?.qwikCity?.endpointResponse?.body;
    } else {
      // Client
      // fetch() for new data when the pathname has changed
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
