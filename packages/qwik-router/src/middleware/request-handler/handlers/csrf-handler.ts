import type { RequestEvent } from '@qwik.dev/router/middleware/request-handler';

export function isContentType(headers: Headers, ...types: string[]) {
  const type = headers.get('content-type')?.split(/;/, 1)[0].trim() ?? '';
  return types.includes(type);
}

export function csrfLaxProtoCheckMiddleware(requestEv: RequestEvent) {
  checkCSRF(requestEv, true);
}
export function csrfCheckMiddleware(requestEv: RequestEvent) {
  checkCSRF(requestEv);
}
function checkCSRF(requestEv: RequestEvent, laxProto?: true) {
  const isForm = isContentType(
    requestEv.request.headers,
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'text/plain'
  );
  if (isForm) {
    const inputOrigin = requestEv.request.headers.get('origin');
    const origin = requestEv.url.origin;
    let forbidden = inputOrigin !== origin;

    if (
      forbidden &&
      laxProto &&
      inputOrigin?.replace(/^http(s)?/g, '') === origin.replace(/^http(s)?/g, '')
    ) {
      forbidden = false;
    }

    if (forbidden) {
      throw requestEv.error(
        403,
        `CSRF check failed. Cross-site ${requestEv.method} form submissions are forbidden.
The request origin "${inputOrigin}" does not match the server origin "${origin}".`
      );
    }
  }
}
