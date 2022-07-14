import type { NormalizedEndpointResponse } from '../../runtime/src/library/types';

export function checkPageRedirect(
  current: URL,
  headers: Headers,
  trailingSlash: boolean | undefined
) {
  const pathname = current.pathname;
  if (pathname !== '/') {
    if (trailingSlash) {
      // must have a trailing slash
      if (!pathname.endsWith('/')) {
        // add slash to existing pathname
        return createRedirect(current, headers, pathname + '/');
      }
    } else {
      // should not have a trailing slash
      if (pathname.endsWith('/')) {
        // remove slash from existing pathname
        return createRedirect(current, headers, pathname.slice(0, pathname.length - 1));
      }
    }
  }
  return null;
}

function createRedirect(current: URL, headers: Headers, updatedPathname: string) {
  if (updatedPathname !== current.pathname) {
    headers.set('location', updatedPathname + current.search);
    return new Response(null, {
      status: 308,
      headers,
    });
  }
  return null;
}

export function checkEndpointRedirect(endpointResponse: NormalizedEndpointResponse | null) {
  if (endpointResponse) {
    const status = endpointResponse.status;
    if (status >= 300 && status < 399) {
      return new Response(null, {
        status,
        headers: endpointResponse.headers,
      });
    }
  }
  return null;
}
