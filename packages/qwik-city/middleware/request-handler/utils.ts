import type { RenderToStringResult } from '@builder.io/qwik/server';
import { Headers as HeadersPolyfill } from 'headers-polyfill';

export function isAcceptJsonOnly(request: Request) {
  return request.headers.get('Accept') === 'application/json';
}

export function getHttpEquivResponse(result: RenderToStringResult) {
  let status = 200;
  const headers: Headers = new HeadersPolyfill();

  if (result.httpEquiv.status) {
    try {
      const parsedStatus = parseInt(result.httpEquiv.status, 10);
      if (parsedStatus >= 200 && parsedStatus < 600) {
        status = parsedStatus;
      }
    } catch (e) {
      /**/
    }
  }

  if (result.httpEquiv.location) {
    const location = result.httpEquiv.location;
    if (status < 300 || status > 399) {
      status = 308;
    }
    headers.set('Location', location);
    return { status, headers };
  }

  headers.set('Content-Type', 'text/html; charset=utf-8');
  for (const [key, value] of Object.entries(result.httpEquiv)) {
    if (key !== 'status' && key !== 'location') {
      headers.set(key, value);
    }
  }

  return { status, headers };
}
