import type { RequestHandler } from '@qwik.dev/router';

// Only `/rewrite-spa/target/` is a route. `/rewrite-spa/pretty/` exists only through this rewrite.
export const onRequest: RequestHandler = ({ url, rewrite }) => {
  if (url.pathname === '/qwikrouter-test/rewrite-spa/pretty/') {
    throw rewrite('/qwikrouter-test/rewrite-spa/target/');
  }
};
