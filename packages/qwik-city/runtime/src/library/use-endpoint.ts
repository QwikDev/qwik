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
    const endpointResponse = await loadEndpointResponse(doc, pathname, cleanup);
    return endpointResponse?.body as any;
  });
};

export const loadEndpointResponse = async (
  doc: QwikCityRenderDocument,
  pathname: string,
  cleanup?: (cb: () => void) => void
) => {
  if (isServer) {
    const ssrEndpointResponse = doc?.__qwikUserCtx?.qwikCity?.endpointResponse;
    if (ssrEndpointResponse) {
      // SSR
      // server has already loaded the data if an endpoint existed for it
      return ssrEndpointResponse;
    }
  } else if (isBrowser) {
    // Client
    // fetch() for new data when the pathname has changed
    const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
    if (cleanup) {
      cleanup(() => controller && controller.abort());
    }

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

    return clientEndpointResponse;
  }

  return null;
};
