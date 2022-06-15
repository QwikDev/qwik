import type { EndpointHandler, EndpointModule, RequestEvent, RouteParams } from '../runtime/types';

export function endpointHandler(
  request: Request,
  url: URL,
  params: RouteParams,
  endpointModule: EndpointModule
) {
  const method = request.method;

  let reqHandler: EndpointHandler | undefined = undefined;

  if (method === 'GET') {
    reqHandler = endpointModule.get;
  } else if (method === 'POST') {
    reqHandler = endpointModule.post;
  } else if (method === 'PUT') {
    reqHandler = endpointModule.put;
  } else if (method === 'PATCH') {
    reqHandler = endpointModule.patch;
  } else if (method === 'OPTIONS') {
    reqHandler = endpointModule.options;
  } else if (method === 'HEAD') {
    reqHandler = endpointModule.head;
  } else if (method === 'DELETE') {
    reqHandler = endpointModule.del;
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
