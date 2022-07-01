export function checkRedirect(current: URL, trailingSlash: boolean | undefined) {
  const pathname = current.pathname;
  if (pathname !== '/') {
    if (trailingSlash) {
      // must have a trailing slash
      if (!pathname.endsWith('/')) {
        // add slash to existing pathname
        return createRedirect(current, pathname + '/');
      }
    } else {
      // should not have a trailing slash
      if (pathname.endsWith('/')) {
        // remove slash from existing pathname
        return createRedirect(current, pathname.slice(0, pathname.length - 1));
      }
    }
  }
  return null;
}

function createRedirect(current: URL, updatedPathname: string) {
  // node-fetch has issues with Response.redirect()
  // so just create it manually
  if (updatedPathname !== current.pathname) {
    return new Response(null, {
      status: 308,
      headers: {
        location: updatedPathname + current.search,
      },
    });
  }
  return null;
}
