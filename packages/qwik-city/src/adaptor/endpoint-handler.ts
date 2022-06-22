import type { EndpointHandler, EndpointModule, RequestEvent, RouteParams } from '../runtime/types';

export function endpointHandler(
  request: Request,
  url: URL,
  params: RouteParams,
  endpointModule: EndpointModule
) {
  const method = request.method;

  let reqHandler: EndpointHandler | undefined = undefined;

  if (method === 'GET' && endpointModule.get) {
    reqHandler = endpointModule.get;
  } else if (method === 'POST' && endpointModule.post) {
    reqHandler = endpointModule.post;
  } else if (method === 'PUT' && endpointModule.put) {
    reqHandler = endpointModule.put;
  } else if (method === 'PATCH' && endpointModule.patch) {
    reqHandler = endpointModule.patch;
  } else if (method === 'OPTIONS' && endpointModule.options) {
    reqHandler = endpointModule.options;
  } else if (method === 'HEAD' && endpointModule.head) {
    reqHandler = endpointModule.head;
  } else if (method === 'DELETE' && endpointModule.del) {
    reqHandler = endpointModule.del;
  } else if (endpointModule.all) {
    reqHandler = endpointModule.all;
  }

  if (typeof reqHandler === 'function') {
    const requestEv: RequestEvent = {
      request,
      url,
      params,
    };
    return reqHandler(requestEv);
  }

  return new Response(`Bad Request: ${method} not supported for endpoint`, {
    status: 400,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
