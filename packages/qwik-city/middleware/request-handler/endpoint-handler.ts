import type {
  EndpointHandler,
  EndpointModule,
  HttpMethod,
  NormalizedEndpointResponse,
  RequestEvent,
  RouteParams,
} from '../../runtime/src/library/types';
import { getStatus } from './utils';

export async function getEndpointResponse(
  request: Request,
  method: HttpMethod,
  url: URL,
  params: RouteParams,
  endpointModule: EndpointModule
) {
  let reqHandler: EndpointHandler | undefined = undefined;

  switch (method) {
    case 'GET': {
      reqHandler = endpointModule.onGet;
      break;
    }
    case 'POST': {
      reqHandler = endpointModule.onPost;
      break;
    }
    case 'PUT': {
      reqHandler = endpointModule.onPut;
      break;
    }
    case 'PATCH': {
      reqHandler = endpointModule.onPatch;
      break;
    }
    case 'OPTIONS': {
      reqHandler = endpointModule.onOptions;
      break;
    }
    case 'HEAD': {
      reqHandler = endpointModule.onHead;
      break;
    }
    case 'DELETE': {
      reqHandler = endpointModule.onDelete;
      break;
    }
  }

  reqHandler = reqHandler || endpointModule.onRequest;

  if (typeof reqHandler === 'function') {
    const requestEv: RequestEvent = { request, url, params };
    const userEndpointResponse = await reqHandler(requestEv);

    if (userEndpointResponse) {
      const headers: Record<string, string> = {};
      const userHeaders = userEndpointResponse.headers;

      if (userHeaders && typeof userHeaders === 'object') {
        for (const [key, value] of Object.entries(userHeaders)) {
          if (
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean'
          ) {
            headers[key.toLocaleLowerCase()] = String(value);
          }
        }
      }

      const redirectLocation = userEndpointResponse.redirect;
      if (typeof redirectLocation === 'string') {
        headers['location'] = redirectLocation;
      }

      const status =
        typeof headers['location'] === 'string'
          ? getStatus(userEndpointResponse.status, 300, 399, 307)
          : getStatus(userEndpointResponse.status, 100, 599, 200);

      const endpointResponse: NormalizedEndpointResponse = {
        status,
        body: userEndpointResponse.body,
        headers,
      };

      return endpointResponse;
    }
  }

  return null;
}

export function endpointHandler(
  method: HttpMethod,
  endpointResponse: NormalizedEndpointResponse | null
) {
  if (endpointResponse) {
    const { status, headers } = endpointResponse;

    if (typeof headers['content-type'] !== 'string') {
      headers['content-type'] = 'application/json; charset=utf-8';
    }

    if (headers['content-type'].startsWith('application/json')) {
      // JSON response
      return new Response(JSON.stringify(endpointResponse.body), {
        status,
        headers,
      });
    }

    if (endpointResponse.body == null) {
      // null || undefined response
      return new Response(endpointResponse.body as any, {
        status,
        headers,
      });
    }

    const type = typeof endpointResponse.body;
    // string response
    if (type === 'string' || type === 'number' || type === 'boolean') {
      return new Response(String(endpointResponse.body), {
        status,
        headers,
      });
    }

    return new Response(`Unsupport response body type: ${JSON.stringify(endpointResponse.body)}`, {
      status: 500,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
      },
    });
  }

  return new Response(`Method Not Allowed: ${method}`, {
    status: 405,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
    },
  });
}
