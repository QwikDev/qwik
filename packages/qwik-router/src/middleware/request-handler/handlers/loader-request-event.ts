import { filterSearchParams, getLoaderRequestEvent } from '../../../runtime/src/route-loaders';
import type { LoaderInternal, RequestEvent } from '../../../runtime/src/types';
import type { RequestEventInternal } from '../request-event-core';

type LoaderRequestEventFactory = (loader: LoaderInternal) => RequestEventInternal;

/**
 * Create per-loader request event views. Loader-specific URL/search data is scoped to the view,
 * while request-wide state (headers, cookies, loader value maps, etc.) still delegates to the
 * original request event.
 */
export function createLoaderRequestEventFactory(
  requestEv: RequestEventInternal
): LoaderRequestEventFactory {
  return (loader) => getLoaderRequestEvent(loader, requestEv) as RequestEventInternal;
}

export function getLoaderFilteredSearch(loader: LoaderInternal, requestEv: RequestEvent): string {
  return loader.__search
    ? filterSearchParams(requestEv.url.searchParams, loader.__search)
    : requestEv.url.search;
}
