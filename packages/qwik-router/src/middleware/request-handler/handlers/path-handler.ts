import { RequestEvent } from '../types';
import { getRequestTrailingSlash } from '../request-event';
import { isQDataRequestBasedOnSharedMap } from '../resolve-request-handlers';
import { HttpStatus } from '../http-status-codes';

export function fixTrailingSlash(ev: RequestEvent) {
  const trailingSlash = getRequestTrailingSlash(ev);
  const { basePathname, originalUrl, sharedMap } = ev;
  const { pathname, search } = originalUrl;
  const isQData = isQDataRequestBasedOnSharedMap(sharedMap);
  if (!isQData && pathname !== basePathname && !pathname.endsWith('.html')) {
    // only check for slash redirect on pages
    if (trailingSlash) {
      // must have a trailing slash
      if (!pathname.endsWith('/')) {
        // add slash to existing pathname
        throw ev.redirect(HttpStatus.MovedPermanently, pathname + '/' + search);
      }
    } else {
      // should not have a trailing slash
      if (pathname.endsWith('/')) {
        // remove slash from existing pathname
        throw ev.redirect(
          HttpStatus.MovedPermanently,
          pathname.slice(0, pathname.length - 1) + search
        );
      }
    }
  }
}
