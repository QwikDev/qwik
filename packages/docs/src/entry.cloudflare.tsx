import { render } from './entry.ssr';

export const onRequestGet: PagesFunction = async ({ request, next, waitUntil }) => {
  try {
    const url = new URL(request.url);
    if (url.hostname === 'qwik.builder.io' && url.pathname === '/') {
      // temporarily redirect homepage to the overview page
      return Response.redirect(new URL('/docs/overview', url), 302);
    }

    if (url.pathname === '/docs') {
      return Response.redirect(new URL('/docs/overview', url));
    }

    if (url.pathname === '/examples') {
      return Response.redirect(new URL('/examples/introduction/hello-world', url));
    }

    if (url.pathname === '/tutorial') {
      return Response.redirect(new URL('/tutorial/introduction/basics', url));
    }

    if (url.pathname === '/chat') {
      return Response.redirect('https://discord.gg/bNVSQmPzqy');
    }

    // Handle static assets
    if (/\.\w+$/.test(url.pathname) || url.pathname.endsWith('/repl-server')) {
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
    const result = await render({
      url: request.url,
      prefetchStrategy: {
        symbolsToPrefetch: 'events-document',
        implementation: 'link-prefetch',
      },
    });

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
