/* eslint-disable */

// @ts-ignore
import { render } from '../server/entry.server.js';
import type { RenderToStringOptions, RenderToStringResult } from '@builder.io/qwik/server';

// @ts-ignore
import manifest from '../dist/q-manifest.json';

export const onRequestGet: PagesFunction = async ({ request, next, waitUntil }) => {
  try {
    const url = new URL(request.url);
    if (url.hostname === 'qwik.builder.io' && url.pathname === '/') {
      // temporarily redirect homepage to the overview page
      return Response.redirect('https://qwik.builder.io/guide/overview', 302);
    }

    if (url.pathname === '/chat') {
      return Response.redirect('https://discord.gg/bNVSQmPzqy');
    }

    // Handle static assets
    if (/\.\w+$/.test(url.pathname) || url.pathname === '/repl/') {
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

    // Render To String Options
    const opts: RenderToStringOptions = {
      url: request.url,
      base: '/build/',
      manifest,
      prefetchStrategy: {
        symbolsToPrefetch: 'events-document',
        implementation: 'worker-fetch',
      },
    };

    // Generate Qwik SSR response
    const result: RenderToStringResult = await render(opts);

    const response = new Response(result.html, {
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
