/* eslint-disable */

// @ts-ignore
import { render } from '../server/entry.server.js';

export const onRequestGet: PagesFunction = async ({ request, next, waitUntil }) => {
  try {
    const url = new URL(request.url);
    if (url.hostname === 'qwik.builder.io' && url.pathname === '/') {
      // temporarily redirect homepage to the overview page
      return Response.redirect('https://qwik.builder.io/guide/overview', 302);
    }

    // Handle static assets
    if (/\.\w+$/.test(url.pathname)) {
      const response = await next(request);

      if (url.pathname.startsWith('/q-')) {
        // assets starting with `q-` we know can be forever cached
        // current workaround until this is merged: https://github.com/cloudflare/wrangler2/pull/796
        const headers = new Headers();
        response.headers.forEach((value, key) => headers.set(key, value));
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        return new Response([101, 204, 205, 304].includes(response.status) ? null : response.body, {
          ...response,
          headers,
        });
      }
      return response;
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
      url: request.url,
      base: '/build/',
    });

    const response = new Response(ssrResult.html, {
      headers: {
        'Cross-Origin-Embedder-Policy': 'credentialless',
        'Cross-Origin-Opener-Policy': 'same-origin',
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
  } catch (e: any) {
    // 500 Error
    return new Response(String(e.stack || e), { status: 500 });
  }
};
