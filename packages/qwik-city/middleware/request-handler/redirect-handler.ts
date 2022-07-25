import type { ResponseHandler } from './types';

export function checkPageRedirect(
  current: URL,
  trailingSlash: boolean | undefined,
  responseHander: ResponseHandler
) {
  const pathname = current.pathname;
  if (pathname !== '/') {
    if (trailingSlash) {
      // must have a trailing slash
      if (!pathname.endsWith('/')) {
        // add slash to existing pathname
        return createPageRedirect(current, pathname + '/', responseHander);
      }
    } else {
      // should not have a trailing slash
      if (pathname.endsWith('/')) {
        // remove slash from existing pathname
        return createPageRedirect(current, pathname.slice(0, pathname.length - 1), responseHander);
      }
    }
  }
  return null;
}

function createPageRedirect(
  current: URL,
  updatedPathname: string,
  responseHander: ResponseHandler
) {
  if (updatedPathname !== current.pathname) {
    const headers = new URLSearchParams({
      Location: updatedPathname + current.search,
    });
    return responseHander(308, headers, Promise.resolve);
  }
  return null;
}
