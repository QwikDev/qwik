import type { RequestHandler } from '@qwik.dev/router';

// Only `/rewrite-spa/target/` is a route. `/rewrite-spa/pretty/` exists only through this rewrite.
export const onRequest: RequestHandler = ({ url, rewrite, cacheControl, headers }) => {
  if (url.pathname === '/qwikrouter-test/rewrite-spa/pretty/') {
    throw rewrite('/qwikrouter-test/rewrite-spa/target/');
  }
  // Same rewrite, but the middleware decides the answer is cacheable and tagged.
  if (url.pathname === '/qwikrouter-test/rewrite-spa/pretty-cached/') {
    cacheControl({ maxAge: 60 }, 'CDN-Cache-Control');
    headers.set('Cache-Tag', 'rewrite-spa-target');
    throw rewrite('/qwikrouter-test/rewrite-spa/target/');
  }
};
