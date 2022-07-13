import { useDocument, useResource$ } from '@builder.io/qwik';
import type { EndpointResponse, QwikCityRenderDocument } from './types';
import { useLocation } from './use-functions';
import { isBrowser, isServer } from '@builder.io/qwik/build';

/**
 * @public
 */
export const useEndpoint = <T = unknown>() => {
  const loc = useLocation();
  const doc = useDocument() as QwikCityRenderDocument;

  return useResource$<T>(async ({ track, cleanup }) => {
    const pathname = track(loc, 'pathname');

    if (isServer) {
      return getSsrEndpointResponse(doc)?.body;
    }

    if (isBrowser) {
      // fetch() for new data when the pathname has changed
      const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
      cleanup(() => controller && controller.abort());

      const clientResponse = await fetch(pathname, {
        method: 'GET',
        headers: {
          accept: 'application/json',
        },
        signal: controller && controller.signal,
      });

      const clientEndpointResponse: EndpointResponse = {
        status: clientResponse.status,
        body: await clientResponse.json(),
        headers: {},
      };
      clientResponse.headers.forEach(([key, value]) => {
        clientEndpointResponse.headers![key] = value;
      });

      return clientEndpointResponse.body as T;
    }
    return null as any;
  });
};

export const getSsrEndpointResponse = (doc: QwikCityRenderDocument) =>
  doc?._qwikUserCtx?.qcResponse || null;
