import type { RequestEvent } from '@qwik.dev/router/middleware/request-handler';

export function isContentType(headers: Headers, ...types: string[]) {
  const type = headers.get('content-type')?.split(/;/, 1)[0].trim() ?? '';
  return types.includes(type);
}

export function csrfCheckMiddleware(requestEv: RequestEvent) {
  const isForm = isContentType(
    requestEv.request.headers,
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'text/plain'
  );
  if (isForm) {
    const inputOrigin = requestEv.request.headers.get('origin');
    const origin = requestEv.url.origin;
    const forbidden = inputOrigin !== origin;
    if (forbidden) {
      throw requestEv.error(
        403,
        `CSRF check failed. Cross-site ${requestEv.method} form submissions are forbidden.
The request origin "${inputOrigin}" does not match the server origin "${origin}".`
      );
    }
  }
}
