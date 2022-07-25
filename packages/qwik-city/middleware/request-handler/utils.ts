import type {
  QwikCityUserContext,
  RouteLocation,
  RouteParams,
} from '../../runtime/src/library/types';
import type { ServerResponseContext } from './types';

export function getQwikCityUserContext(
  url: URL,
  params: RouteParams,
  response: ServerResponseContext
): QwikCityUserContext {
  const qcRoute: RouteLocation = {
    href: url.href,
    params: { ...params },
    pathname: url.pathname,
  };

  return {
    qcRoute,
    qcResponse: {
      body: response.body,
      status: response.statusCode,
    },
  };
}
