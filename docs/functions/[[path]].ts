/* eslint-disable */

// @ts-ignore
import { qwikSSR } from '../server/build/entry.cloudflare.js';

const CACHE_CONTROL = 60;

export const onRequestGet: PagesFunction = async (req) => {
  // Handle static assets
  if (/\.\w+$/.test(req.request.url)) {
    return req.next(req.request);
  }

  // Early return from cache
  const cache = await caches.open('custom:qwik');
  if (CACHE_CONTROL > 0) {
    const cachedResponse = await cache.match(req.request);
    if (cachedResponse) {
      return cachedResponse;
    }
  }

  // Generate SSR response
  const response = (await qwikSSR(req)) as Response;

  // Cache results
  if (CACHE_CONTROL > 0) {
    response.headers.set('Cache-Control', `max-age=${CACHE_CONTROL}`);
    req.waitUntil(cache.put(req.request, response.clone()));
  }
  return response;
};
