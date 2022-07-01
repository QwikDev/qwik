import { render } from './entry.ssr';

/**
 * Cloudflare Pages Request Handler
 */
export const onRequest: PagesFunction = async ({ request, next, waitUntil }) => {
  try {
    const url = new URL(request.url);

    // Handle static assets
    if (/\.\w+$/.test(request.url)) {
      return next(request);
    }

    // Do not using caching during development
    const useCache = url.hostname !== 'localhost' && request.method === 'GET';

    // Early return from cache
    const cache = await caches.open('custom:qwik');
    if (useCache) {
      const cachedResponse = await cache.match(request);
      if (cachedResponse) {
        return cachedResponse;
      }
    }

    // Generate Qwik SSR HTML
    const result = await render({
      url: request.url,
    });

    // Create HTTP Response
    const response = new Response(result.html, {
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
