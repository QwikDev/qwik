export function checkPageRedirect(current: URL, headers: Headers, trailingSlash?: boolean) {
  const pathname = current.pathname;
  if (pathname !== '/') {
    if (trailingSlash) {
      // must have a trailing slash
      if (!pathname.endsWith('/')) {
        // add slash to existing pathname
        return createPageRedirect(current, headers, pathname + '/');
      }
    } else {
      // should not have a trailing slash
      if (pathname.endsWith('/')) {
        // remove slash from existing pathname
        return createPageRedirect(current, headers, pathname.slice(0, pathname.length - 1));
      }
    }
  }
  return null;
}

function createPageRedirect(current: URL, headers: Headers, updatedPathname: string) {
  if (updatedPathname !== current.pathname) {
    headers.set('location', updatedPathname + current.search);
    return new Response(null, {
      status: 308,
      headers,
    });
  }
  return null;
}
