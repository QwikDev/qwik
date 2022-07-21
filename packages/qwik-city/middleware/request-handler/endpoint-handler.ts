import type {
  EndpointHandler,
  EndpointModule,
  EndpointResponse,
  HttpMethod,
  ResponseContext,
  RouteParams,
} from '../../runtime/src/library/types';
import { Headers as HeadersPolyfill } from 'headers-polyfill';

export async function getEndpointResponse(
  request: Request,
  method: HttpMethod,
  url: URL,
  params: RouteParams,
  endpointModules: EndpointModule[]
) {
  let middlewareIndex = -1;

  const headers = new HeadersPolyfill();

  const endpointResponse: EndpointResponse = {
    body: null,
    status: 200,
    headers,
    hasEndpointHandler: false,
    immediateCommitToNetwork: false,
  };

  const status = (statusCode: number) => {
    endpointResponse.status = statusCode;
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
    headers.set('Location', url);
    endpointResponse.immediateCommitToNetwork = true;
  };

  const response: ResponseContext = {
    status,
    headers,
    redirect,
    get statusCode() {
      return endpointResponse.status;
    },
    get aborted() {
      return middlewareIndex >= ABORT_INDEX;
    },
  };

  const abort = () => {
    middlewareIndex = ABORT_INDEX;
  };

  const next = async () => {
    middlewareIndex++;

    while (middlewareIndex < endpointModules.length) {
      const endpointModule = endpointModules[middlewareIndex];

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
        endpointResponse.hasEndpointHandler = true;

        const body = await reqHandler({ request, url, params, response, next, abort });
        if (body !== undefined) {
          endpointResponse.body = body;
        }
      }

      middlewareIndex++;
    }
  };

  try {
    await next();
  } catch (e: any) {
    endpointResponse.body = String(e ? e.stack : e || 'Endpoint Error');
    endpointResponse.status = 500;
    endpointResponse.headers.forEach((_, key) => endpointResponse.headers.delete(key));
    endpointResponse.headers.set('Content-Type', 'text/plain; charset=utf-8');
    endpointResponse.immediateCommitToNetwork = true;
  }

  return endpointResponse;
}

export function endpointHandler(method: HttpMethod, endpointResponse: EndpointResponse) {
  const { status, headers, hasEndpointHandler } = endpointResponse;

  if (hasEndpointHandler) {
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json; charset=utf-8');
    }

    if (headers.get('Content-Type')!.startsWith('application/json')) {
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

const ABORT_INDEX = 999999999;
