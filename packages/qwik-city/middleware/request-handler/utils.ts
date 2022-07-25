import type {
  HttpMethod,
  EndpointResponse,
  QwikCityUserContext,
  RouteLocation,
  RouteParams,
} from '../../runtime/src/library/types';

export function isAcceptJsonOnly(request: Request) {
  return request.headers.get('accept') === 'application/json';
}

export function getQwikCityUserContext(
  url: URL,
  params: RouteParams,
  method: HttpMethod,
  endpointResponse: EndpointResponse
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
      request: {
        method,
      },
      response: endpointResponse,
    },
  };
}
