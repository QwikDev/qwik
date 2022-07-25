import type {
  QwikCityUserContext,
  RouteLocation,
  RouteParams,
} from '../../runtime/src/library/types';
import type { ServerResponseContext } from './types';

export function getQwikCityUserContext(
  url: URL,
  params: RouteParams,
  endpointResponse: ServerResponseContext
): { qwikcity: QwikCityUserContext } {
  const route: RouteLocation = {
    href: url.href,
    params: { ...params },
    pathname: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
  };

  return {
    qwikcity: {
      route,
      response: {
        body: endpointResponse.body,
        status: endpointResponse.statusCode
      },
    },
  };
}
