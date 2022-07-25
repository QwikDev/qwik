import type { ServerResponseContext } from './types';

export function checkPageRedirect(
  current: URL,
  response: ServerResponseContext,
  trailingSlash: boolean | undefined
) {
  const pathname = current.pathname;
  if (pathname !== '/') {
    if (trailingSlash) {
      // must have a trailing slash
      if (!pathname.endsWith('/')) {
        // add slash to existing pathname
        createPageRedirect(current, response, pathname + '/');
      }
    } else {
      // should not have a trailing slash
      if (pathname.endsWith('/')) {
        // remove slash from existing pathname
        createPageRedirect(current, response, pathname.slice(0, pathname.length - 1));
      }
    }
  }
}

function createPageRedirect(
  current: URL,
  response: ServerResponseContext,
  updatedPathname: string
) {
  if (updatedPathname !== current.pathname) {
    response.redirect(updatedPathname + current.search, 308);
  }
}
