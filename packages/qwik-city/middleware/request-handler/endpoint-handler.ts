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
  endpointModules: EndpointModule[]
) {
  const endpointResponse: EndpointResponse = {
    body: null,
    status: 200,
    headers: {},
    hasHandler: false,
  };

  const status = (statusCode: number) => {
    endpointResponse.status = statusCode;
  };

  const headers = (userHeaders: Record<string, string | undefined>) => {
    if (userHeaders && typeof userHeaders === 'object') {
      for (const [key, value] of Object.entries(userHeaders)) {
        if (
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean' ||
          value === null ||
          value === undefined
        ) {
          endpointResponse.headers[key.toLocaleLowerCase()] = String(value);
        }
      }
    }
  };

  const redirect = (url: string, statusCode?: number) => {
    if (typeof statusCode === 'number') {
      endpointResponse.status = statusCode;
    }
    if (
      typeof endpointResponse.status !== 'number' ||
      endpointResponse.status < 300 ||
      endpointResponse.status > 399
    ) {
      endpointResponse.status = 307;
    }
    headers({ location: url });
  };

  let i = 0;
  let ended = false;

  const next = async () => {
    if (!ended) {
      try {
        const endpointModule = endpointModules[i];
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
          endpointResponse.hasHandler = true;

          const body = await reqHandler(requestEv);
          if (body !== undefined) {
            endpointResponse.body = body;
            ended = true;
          }
        }

        i++;
      } catch (e: any) {
        ended = true;
        endpointResponse.body = String(e ? e.stack : e || 'Endpoint Error');
        endpointResponse.status = 500;
        endpointResponse.headers = { 'content-type': 'text/plain; charset=utf-8' };
      }
    }

    return {
      status: endpointResponse.status,
      headers: { ...endpointResponse.headers },
      body: endpointResponse.body,
    };
  };

  const requestEv: RequestEvent = { request, url, params, status, headers, redirect, next };

  while (!ended) {
    await next();
  }

  return endpointResponse;
}

export function endpointHandler(method: HttpMethod, endpointResponse: EndpointResponse) {
  const { status, headers, hasHandler } = endpointResponse;

  if (hasHandler) {
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
      return new Response(endpointResponse.body, {
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

    return new Response(`Unsupport response body type`, {
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
