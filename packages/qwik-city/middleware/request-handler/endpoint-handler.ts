import type {
  EndpointHandler,
  EndpointModule,
  RequestEvent,
} from '../../runtime/src/library/types';

export function endpointHandler(requestEv: RequestEvent, endpointModule: EndpointModule) {
  try {
    let reqHandler: EndpointHandler | undefined = undefined;

    switch (requestEv.method) {
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
      return reqHandler(requestEv);
    }

    return new Response(`Bad Request: ${requestEv.method} not supported for endpoint`, {
      status: 400,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
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
