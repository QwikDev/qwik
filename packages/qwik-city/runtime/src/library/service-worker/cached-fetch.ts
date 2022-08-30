import type { AwaitingRequests, Fetch } from './types';
import { useCache } from './utils';

export const cachedFetch = (
  cache: Cache,
  fetch: Fetch,
  awaitingRequests: AwaitingRequests,
  request: Request
) =>
  new Promise<Response>((promiseResolve, promiseReject) => {
    const url = request.url;
    const awaitingRequestResolves = awaitingRequests.get(url);

    if (awaitingRequestResolves) {
      // there's already an active request happening
      // don't start a new request
      awaitingRequestResolves.push({ resolve: promiseResolve, reject: promiseReject });
    } else {
      // there isn't already an active request for this url
      // start a new request
      const resolve = (response: Response) => {
        // the response has been resolved
        const resolves = awaitingRequests.get(url);
        if (resolves) {
          // loop through each of the active request
          awaitingRequests.delete(url);
          for (const { resolve } of resolves) {
            // clone a new response for each of the active requests
            resolve(response.clone());
          }
        } else {
          // somehow the array of awaiting requests doesn't exist
          promiseResolve(response.clone());
        }
      };

      const reject = (msg: any) => {
        const resolves = awaitingRequests.get(url);
        if (resolves) {
          awaitingRequests.delete(url);
          for (const { reject } of resolves) {
            reject(msg);
          }
        } else {
          promiseReject(msg);
        }
      };

      // create a new array of the request waiting to be resolved
      awaitingRequests.set(url, [{ resolve: promiseResolve, reject: promiseReject }]);

      cache
        .match(url)
        .then((cachedResponse) => {
          if (useCache(request, cachedResponse)) {
            // cached response found and user did not specifically send
            // a request header to NOT use the cache (wasn't a hard refresh)
            resolve(cachedResponse!);
          } else {
            // no cached response found or user didn't want to use the cache
            // do a full network request
            return fetch(request).then((networkResponse) => {
              return cache.put(url, networkResponse.clone()).then(() => {
                resolve(networkResponse);
              });
            });
          }
        })
        .catch((err) => {
          // network error, probably offline
          return cache.match(url).then((cachedResponse) => {
            if (cachedResponse) {
              // luckily we have a cached version, let's use it instead of an offline message
              resolve(cachedResponse);
            } else {
              // darn, we've got no connectivity and no cached response
              // respond with a 503 offline message
              reject(err);
            }
          });
        });
    }
  });
