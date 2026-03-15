import { useHttpStatus } from './use-functions';
import type { CacheKeyFn, ContentModuleHead, PageModule, RouteModule } from './types';

/**
 * Creates a synthetic page module for not-found routes that:
 *
 * - Renders the 404 module for 404 status, the error module for other statuses
 * - Exports cacheKey based on status (all same-status errors share one cache entry)
 * - Proxies the head export from the 404 module
 */
export function createNotFoundWrapper(notFoundMod: RouteModule, errorMod: RouteModule): PageModule {
  const NotFound = (notFoundMod as PageModule).default;
  const ErrorPage = (errorMod as PageModule).default;

  const Component = () => {
    const { status } = useHttpStatus();
    if (status === 404 && NotFound) {
      return NotFound({});
    }
    if (ErrorPage) {
      return ErrorPage({});
    }
    return null;
  };

  // Read head from routeConfig if available, falling back to standalone head export
  const notFoundHead =
    (notFoundMod as PageModule).routeConfig &&
    typeof (notFoundMod as PageModule).routeConfig !== 'function'
      ? ((notFoundMod as PageModule).routeConfig as { head?: ContentModuleHead }).head
      : (notFoundMod as PageModule).head;
  const errorHead =
    (errorMod as PageModule).routeConfig &&
    typeof (errorMod as PageModule).routeConfig !== 'function'
      ? ((errorMod as PageModule).routeConfig as { head?: ContentModuleHead }).head
      : (errorMod as PageModule).head;

  return {
    default: Component,
    head: (notFoundHead ?? errorHead) as ContentModuleHead,
    cacheKey: ((status: number) => String(status)) as CacheKeyFn,
  };
}
