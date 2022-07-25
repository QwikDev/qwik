import { useResource$ } from '@builder.io/qwik';
import { useLocation, useQwikCityContext } from './use-functions';
import { isServer } from '@builder.io/qwik/build';

/**
 * @public
 */
export const useEndpoint = <T = unknown>() => {
  const loc = useLocation();
  const ctx = useQwikCityContext();
  return useResource$<T>(async ({ track, cleanup }) => {
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
