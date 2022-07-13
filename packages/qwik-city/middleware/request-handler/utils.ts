import type {
  EndpointResponse,
  HttpMethod,
  QwikCityUserContext,
  RouteLocation,
  RouteParams,
} from '../../runtime/src/library/types';

export function getStatus(input: any, min: number, max: number, fallback: number) {
  if (typeof input === 'number' && input >= min && input <= max) {
    return input;
  }
  return fallback;
}

export function getHeaderValue(input: any, headerKey: string) {
  if (input && typeof input === 'object') {
    headerKey = headerKey.toLocaleLowerCase();
    for (const [key, value] of Object.entries(input)) {
      if (value) {
        if (key.toLocaleLowerCase() === headerKey) {
          return String(value);
        }
      }
    }
  }
  return null;
}

export function createPageHeaders(input: any) {
  const headers: { [key: string]: string } = {};
  let hasContentType = false;
  if (input && typeof input === 'object') {
    for (const [key, value] of Object.entries(input)) {
      if (value) {
        if (key.toLocaleLowerCase() === 'content-type') {
          hasContentType = true;
        }
        headers[key] = String(value);
      }
    }
  }
  if (!hasContentType) {
    headers['Content-Type'] = 'text/html; charset=utf-8';
  }

  return headers;
}

export function isAcceptJsonOnly(request: Request) {
  return request.headers.get('Accept') === 'application/json';
}

export function checkEndpointRedirect(endpointResponse: EndpointResponse | null) {
  if (endpointResponse) {
    const redirectLocation = getHeaderValue(endpointResponse.headers, 'location');
    if (redirectLocation) {
      return new Response(null, {
        status: getStatus(endpointResponse.status, 300, 399, 308),
        headers: {
          Location: redirectLocation,
        },
      });
    }
  }
  return null;
}

export function getQwikCityUserContext(
  url: URL,
  params: RouteParams,
  method: HttpMethod,
  endpointResponse: EndpointResponse | null
): QwikCityUserContext {
  const qcRoute: RouteLocation = {
    hash: url.hash,
    hostname: url.hostname,
    href: url.href,
    params: { ...params },
    pathname: url.pathname,
    query: {},
    search: url.search,
  };
  url.searchParams.forEach((value, key) => (qcRoute.query[key] = value));

  return {
    qcRoute,
    qcRequest: {
      method,
    },
    qcResponse: endpointResponse,
  };
}
