import type {
  EndpointHandler,
  EndpointModule,
  RequestEvent,
  RouteParams,
} from '../../runtime/src/library/types';

export function endpointHandler(
  request: Request,
  url: URL,
  params: RouteParams,
  endpointModule: EndpointModule
) {
  const method = request.method;

  let reqHandler: EndpointHandler | undefined = undefined;

  switch (method) {
    case 'GET': {
      reqHandler = endpointModule.get;
      break;
    }
    case 'POST': {
      reqHandler = endpointModule.post;
      break;
    }
    case 'PUT': {
      reqHandler = endpointModule.put;
      break;
    }
    case 'PATCH': {
      reqHandler = endpointModule.patch;
      break;
    }
    case 'OPTIONS': {
      reqHandler = endpointModule.options;
      break;
    }
    case 'HEAD': {
      reqHandler = endpointModule.head;
      break;
    }
    case 'DELETE': {
      reqHandler = endpointModule.del;
      break;
    }
  }

  reqHandler = reqHandler || endpointModule.all;

  if (typeof reqHandler === 'function') {
    const requestEv: RequestEvent = { method, request, url, params };
    return reqHandler(requestEv);
  }

  return new Response(`Bad Request: ${method} not supported for endpoint`, {
    status: 400,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
