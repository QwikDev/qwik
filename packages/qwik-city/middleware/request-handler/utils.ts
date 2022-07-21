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
): QwikCityUserContext {
  const qcRoute: RouteLocation = {
    href: url.href,
    params: { ...params },
    pathname: url.pathname,
  };

  return {
    qcRoute,
    qcRequest: {
      method,
    },
    qcResponse: endpointResponse,
  };
}
