import type {
  EndpointHandler,
  EndpointModule,
  RequestEvent,
  RouteParams,
} from '../../runtime/src/library/types';
import type { ServerResponseContext } from './types';

export async function loadEndpointResponse(
  request: Request,
  serverResponse: ServerResponseContext,
  url: URL,
  params: RouteParams,
  endpointModules: EndpointModule[],
  isEndpointOnly: boolean
) {
  let middlewareIndex = -1;
  let hasRequestHandler = false;

  const abort = () => {
    middlewareIndex = ABORT_INDEX;
  };

  const next = async () => {
    middlewareIndex++;

    while (middlewareIndex < endpointModules.length) {
      const endpointModule = endpointModules[middlewareIndex];

      let reqHandler: EndpointHandler | undefined = undefined;

      switch (request.method) {
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
        hasRequestHandler = true;

        // create user request event, which is a narrowed down request context
        const requstEv: RequestEvent = {
          request,
          url,
          params,
          response: {
            status: serverResponse.status,
            get statusCode() {
              return serverResponse.statusCode;
            },
            headers: serverResponse.headers,
            redirect: serverResponse.redirect,
          },
          next,
          abort,
        };

        // get the user's endpoint return data
        serverResponse.body = await reqHandler(requstEv);
      }

      middlewareIndex++;
    }
  };

  try {
    await next();

    if (isEndpointOnly || isAcceptJsonOnly(request)) {
      // this can only be an endpoint response and not a content page render/response

      if (!hasRequestHandler) {
        // can only be an endpoint but there wasn't a handler for this method
        serverResponse.status(405);
        serverResponse.headers.set('Content-Type', 'text/plain; charset=utf-8');
        serverResponse.write(`Method Not Allowed: ${request.method}`);
        serverResponse.handled = true;
        return;
      }

      if (!serverResponse.headers.has('Content-Type')) {
        // default to use a application/json content type response
        serverResponse.headers.set('Content-Type', 'application/json; charset=utf-8');
      }

      // the data from each layout/page endpoint is already completed in "body"
      if (serverResponse.headers.get('Content-Type')!.startsWith('application/json')) {
        // JSON response, stringify the body
        serverResponse.write(JSON.stringify(serverResponse.body));
        serverResponse.handled = true;
      } else if (serverResponse.body == null) {
        // null || undefined response
        serverResponse.handled = true;
      } else {
        const type = typeof serverResponse.body;
        // serialize for a string response
        if (type === 'string' || type === 'number' || type === 'boolean') {
          serverResponse.write(String(serverResponse.body));
          serverResponse.handled = true;
        } else {
          // don't know how to serialize this object for the response
          serverResponse.status(500);
          serverResponse.headers.set('Content-Type', 'text/plain; charset=utf-8');
          serverResponse.write('Unsupport response body type');
          serverResponse.handled = true;
        }
      }
    }
  } catch (e: any) {
    serverResponse.status(500);
    serverResponse.headers.set('Content-Type', 'text/plain; charset=utf-8');
    serverResponse.write(String(e ? e.stack : e || 'Endpoint Error'));
    serverResponse.handled = true;
  }
}

function isAcceptJsonOnly(request: Request) {
  return request.headers.get('Accept') === 'application/json';
}

const ABORT_INDEX = 999999999;
