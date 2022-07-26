import { useResource$ } from '@builder.io/qwik';
import { useLocation, useQwikCityContext } from './use-functions';
import { isServer } from '@builder.io/qwik/build';
import type { EndpointHandler } from './types';

type GetEndpointData<T> = T extends EndpointHandler<infer U> ? U : T;

/**
 * @public
 */
export const useEndpoint = <T = unknown, _R = GetEndpointData<T>>() => {
  const loc = useLocation();
  const ctx = useQwikCityContext();
  return useResource$<_R>(async ({ track, cleanup }) => {
    const pathname = track(loc, 'pathname');

    if (isServer) {
      if (!ctx) {
        throw new Error('Endpoint response body is missing');
      }
      return ctx.response.body;
    } else {
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

      const body = await clientResponse.json();
      return body as T;
    }
  });
};
