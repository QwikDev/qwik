/* eslint-disable */

// @ts-ignore
import { render } from '../server/build/entry.server.js';
import symbols from '../server/q-symbols.json';

export const onRequestGet: PagesFunction = async ({ request, next, waitUntil }) => {
  // Handle static assets
  try {
    const url = new URL(request.url);

    if (/\.\w+$/.test(url.pathname)) {
      return next(request);
    }

    // do not using caching during development
    const useCache = url.hostname !== 'localhost';

    // Early return from cache
    const cache = await caches.open('custom:qwik');
    if (useCache) {
      const cachedResponse = await cache.match(request);
      if (cachedResponse) {
        return cachedResponse;
      }
    }

    // Generate Qwik SSR response
    const ssrResult = await render({
      url: new URL(request.url),
      symbols,
      base: '/',
    });

    const response = new Response(ssrResult.html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': useCache
          ? `max-age=60, s-maxage=10, stale-while-revalidate=604800, stale-if-error=604800`
          : `no-cache, max-age=0`,
      },
    });

    if (useCache) {
      waitUntil(cache.put(request, response.clone()));
    }

    // Return Qwik SSR response
    return response;
  } catch (e) {
    // 500 Error
    return new Response(String(e), { status: 500 });
  }
};
