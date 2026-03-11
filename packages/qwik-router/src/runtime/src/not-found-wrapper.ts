import { useHttpStatus } from './use-functions';
import type { ContentModuleHead, DocumentHead, PageModule, RouteModule } from './types';

/**
 * Creates a synthetic page module for not-found routes that:
 *
 * - Renders the 404 module for 404 status, the error module for other statuses
 * - Includes cacheKey based on status (all same-status errors share one cache entry)
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

  const innerHead = ((notFoundMod as PageModule).head ??
    (errorMod as PageModule).head) as ContentModuleHead;

  // Wrap the inner head to add cacheKey based on status
  const head: DocumentHead = (props) => {
    const base = typeof innerHead === 'function' ? innerHead(props) : (innerHead ?? {});
    return {
      ...base,
      cacheKey: String(props.status),
    };
  };

  return {
    default: Component,
    head,
  };
}
