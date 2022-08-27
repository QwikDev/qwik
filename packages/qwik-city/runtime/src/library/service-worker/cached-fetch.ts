import { activeRequests, existingPrefetches } from './constants';
import type { Fetch } from './types';
import { useCache } from './utils';

export const cachedFetch = (cache: Cache, fetch: Fetch, request: Request) => {
  const url = request.url;

  // possible multiple requests come in for the same url
  let activeRequest = activeRequests.get(url);

  if (!activeRequest) {
    // if there's already an active request (async cache lookup and async network fetch)
    // then use the active request before starting a new one

    let resolve: ((rsp: Response) => void) | null;
    activeRequest = new Promise<Response>((activeResolve) => (resolve = activeResolve));

    // set this url has an active request to prevent double network requests
    activeRequests.set(url, activeRequest);

    cache
      .match(url)
      .then((cachedResponse) => {
        if (useCache(request, cachedResponse)) {
          // cached response found and user did not specifically send
          // a request header to NOT use the cache (wasn't a hard refresh)
          resolve!(cachedResponse!.clone());
        } else {
          // no cached response found or user didn't want to use the cache
          // do a full network request
          return fetch(request).then((networkResponse) => {
            return cache.put(url, networkResponse.clone()).then(() => {
              resolve!(networkResponse.clone());
              existingPrefetches.add(url);
            });
          });
        }
      })
      .catch(() => {
        // network error, probably offline
        return cache.match(url).then((cachedResponse) => {
          if (cachedResponse) {
            // luckily we have a cached version, let's use it instead of an offline message
            resolve!(cachedResponse.clone());
          } else {
            // darn, we've got no connectivity and no cached response
            // respond with a 503 offline message
            resolve!(
              new Response('Offline', {
                status: 503,
                headers: {
                  'Content-Type': 'text/plain',
                },
              })
            );
          }
        });
      })
      .finally(() => {
        // promise resolved (or errored), remove from active request
        activeRequests.delete(url);
      });
  }

  return activeRequest;
};
