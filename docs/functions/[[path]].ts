/* eslint-disable */

// @ts-ignore
import { qwikSSR } from '../server/build/entry.cloudflare.js';

const CACHE_CONTROL = 60;

export const onRequestGet: PagesFunction = async (req) => {
  // Handle static assets
  try {
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
    const res = (await qwikSSR(req)) as Response;

    // Cache results
    res.headers.set(
      'Cache-Control',
      `max-age=${CACHE_CONTROL}, s-maxage=10, stale-while-revalidate=604800, stale-if-error=604800`
    );
    req.waitUntil(cache.put(req.request, res.clone()));

    // Return SSR'd response
    return res;
  } catch (e) {
    return new Response(String(e), { status: 500 });
  }
};
