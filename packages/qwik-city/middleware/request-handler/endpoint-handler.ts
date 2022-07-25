import HeadersPolyfill from 'headers-polyfill/lib/Headers';
import type {
  EndpointHandler,
  EndpointModule,
  RequestContext,
  RequestEvent,
  RouteParams,
} from '../../runtime/src/library/types';
import type { UserResponseContext } from './types';

export async function loadEndpointResponse(
  request: RequestContext,
  url: URL,
  params: RouteParams,
  endpointModules: EndpointModule[],
  isEndpointOnly: boolean
) {
  let middlewareIndex = -1;
  let hasRequestHandler = false;

  const userResponseContext: UserResponseContext = {
    url,
    params,
    status: 200,
    headers: new HeadersPolyfill(),
    body: undefined,
    handler: null,
  };

  const abort = () => {
    middlewareIndex = ABORT_INDEX;
  };

  const redirect = (url: string, status?: number) => {
    userResponseContext.status = typeof status === 'number' ? status : 307;
    userResponseContext.headers.set('Location', url);
    userResponseContext.handler = 'redirect';
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
            get status() {
              return userResponseContext.status;
            },
            set status(code) {
              userResponseContext.status = code;
            },
            headers: userResponseContext.headers,
            redirect,
          },
          next,
          abort,
        };

        // get the user's endpoint return data
        userResponseContext.body = await reqHandler(requstEv);
      }

      middlewareIndex++;
    }
  };

  try {
    await next();

    if (isEndpointOnly || request.headers.get('Accept') === 'application/json') {
      // this can only be an endpoint response and not a content page render/response

      if (!hasRequestHandler) {
        // can only be an endpoint but there wasn't a handler for this method
        userResponseContext.status = 405;
        userResponseContext.headers.set('Content-Type', 'text/plain; charset=utf-8');
        userResponseContext.body = `Method Not Allowed: ${request.method}`;
        userResponseContext.handler = 'endpoint';
        return userResponseContext;
      }

      if (!userResponseContext.headers.has('Content-Type')) {
        // default to use a application/json content type response
        userResponseContext.headers.set('Content-Type', 'application/json; charset=utf-8');
      }

      // the data from each layout/page endpoint is already completed in "body"
      if (userResponseContext.headers.get('Content-Type')!.startsWith('application/json')) {
        // JSON response, stringify the body
        userResponseContext.body = JSON.stringify(userResponseContext.body);
        userResponseContext.handler = 'endpoint';
      } else if (userResponseContext.body == null) {
        // null || undefined response
        userResponseContext.handler = 'endpoint';
      } else {
        const type = typeof userResponseContext.body;
        // serialize for a string response
        if (type === 'string' || type === 'number' || type === 'boolean') {
          userResponseContext.body = String(userResponseContext.body);
          userResponseContext.handler = 'endpoint';
        } else {
          // don't know how to serialize this object for the response
          userResponseContext.status = 500;
          userResponseContext.headers.set('Content-Type', 'text/plain; charset=utf-8');
          userResponseContext.body = 'Unsupport response body type';
          userResponseContext.handler = 'endpoint';
        }
      }
    } else {
      // not an endpoint only response
      // render the page
      userResponseContext.handler = 'page';

      // default to text/html content if it wasn't provided
      if (!userResponseContext.headers.has('Content-Type')) {
        userResponseContext.headers.set('Content-Type', 'text/html; charset=utf-8');
      }
    }
  } catch (e: any) {
    userResponseContext.status = 500;
    userResponseContext.headers.set('Content-Type', 'text/plain; charset=utf-8');
    userResponseContext.body = String(e ? e.stack : e || 'Endpoint Error');
    userResponseContext.handler = 'endpoint';
  }

  return userResponseContext;
}

const ABORT_INDEX = 999999999;
