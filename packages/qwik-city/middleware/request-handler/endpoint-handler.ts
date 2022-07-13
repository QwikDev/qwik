import type {
  EndpointHandler,
  EndpointModule,
  EndpointResponse,
  HttpMethod,
  RequestEvent,
  RouteParams,
} from '../../runtime/src/library/types';

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
    const requestEv: RequestEvent = { method, request, url, params };
    const endpointResponse = await reqHandler(requestEv);
    return endpointResponse;
  }

  return null;
}

export function endpointHandler(method: HttpMethod, endpointResponse: EndpointResponse | null) {
  if (endpointResponse) {
    let status = 200;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8',
    };

    if (endpointResponse.headers) {
      for (const [key, value] of Object.entries(endpointResponse.headers)) {
        if (value) {
          const normalizedKey = key.toLocaleLowerCase();
          if (normalizedKey === 'content-type') {
            headers['Content-Type'] = value;
          } else {
            headers[key] = value;
          }
        }
      }
      if (typeof endpointResponse.status === 'number') {
        if (endpointResponse.status >= 100 && endpointResponse.status <= 599) {
          status = endpointResponse.status;
        }
      }
    }

    if (headers['Content-Type'].startsWith('application/json')) {
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
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }

  return new Response(`Method Not Allowed: ${method}`, {
    status: 405,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
