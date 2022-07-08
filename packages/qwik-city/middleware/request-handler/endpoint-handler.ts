import type {
  EndpointHandler,
  EndpointModule,
  HttpMethod,
  RequestEvent,
  RouteParams,
} from '../../runtime/src/library/types';

export async function endpointHandler(
  request: Request,
  method: HttpMethod,
  url: URL,
  params: RouteParams,
  endpointModule: EndpointModule
) {
  try {
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

      if (endpointResponse) {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json; charset=utf-8',
        };
        let status = 200;

        if (endpointResponse.headers) {
          for (const [key, value] of Object.entries(endpointResponse.headers)) {
            const normalizedKey = key.toLocaleLowerCase();
            if (normalizedKey === 'content-type') {
              headers['Content-Type'] = value;
            } else {
              headers[key] = value;
            }
          }
          if (typeof endpointResponse.status === 'number') {
            status = endpointResponse.status;
          }
        }

        if (headers['Content-Type'].startsWith('application/json')) {
          // JSON Response
          return new Response(JSON.stringify(endpointResponse.body), {
            status,
            headers,
          });
        } else {
          // String Response
          return new Response(String(endpointResponse.body), {
            status,
            headers,
          });
        }
      }

      return new Response(`Invalid endpoint response data`, {
        status: 500,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });
    }

    return new Response(`Bad Request: ${method} method not supported for endpoint`, {
      status: 400,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  } catch (e) {
    return new Response(`Error: ${String(e)}`, {
      status: 500,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }
}
