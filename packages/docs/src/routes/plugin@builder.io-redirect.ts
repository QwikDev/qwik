import type { RequestHandler } from '@builder.io/qwik-city/middleware/request-handler';

/**
 * @file
 *
 *   Redirects requests from Builder.io to the qwik.dev domain.
 *
 *   This redirect has been placed here because of security vulnerabilities on the builder.io domain.
 *
 *   # Issue
 *
 *   - Because of Qwik REPL is is possible to write arbitrary code that runs on a builder.io subdomain
 *       with qwik.dev/repl
 *   - This opens vulnerabilities around XSS, cookie jacking, because builder.io uses cross-subdomain
 *       cookies
 *
 *   # Solution
 *
 *   - Move the qwik.dev/repl of the qwik.dev domain to the qwik.dev domain.
 *   - Place a 308 redirect here to ensure that all requests to the builder.io domain are redirected to
 *       the qwik.dev domain.
 */

export const onRequest: RequestHandler = ({ request, redirect }) => {
  const url = new URL(request.url);
  if (url.hostname === 'qwik.builder.io') {
    // Redirect to the Builder.io plugin
    url.hostname = 'qwik.dev';
    const pathname = url.pathname;
    if (pathname.startsWith('/repl/')) {
      // Prevent anything from /repl/ from being redirected so that we don't accidentally serve a script tag.
      url.pathname = '';
    }
    throw redirect(308, url.toString());
  }
};
