import { Headers } from './headers';
import { HttpStatus } from './http-status-codes';
import type { QwikCityRequestContext } from './types';

export function notFoundHandler<T = any>(requestCtx: QwikCityRequestContext): Promise<T> {
  const status = HttpStatus.NotFound;
  const text = 'Not Found';
  return minimalResponse(requestCtx, status, text, null, COLOR_400, '300px');
}

export function methodNotAllowedHandler<T = any>(requestCtx: QwikCityRequestContext): Promise<T> {
  const status = HttpStatus.MethodNotAllowed;
  const text = `Method Not Allowed: ${requestCtx.request.method}`;
  return minimalResponse(requestCtx, status, text, null, COLOR_400, '300px');
}

export function errorHandler(requestCtx: QwikCityRequestContext, err: any) {
  const status = HttpStatus.InternalServerError;
  let text = 'Server Error';
  let message: string | null = null;

  if (err) {
    if (typeof err === 'object') {
      if (typeof err.message === 'string') {
        text = err.message;
      }
      if (typeof err.stack === 'string') {
        message = err.stack;
      }
    } else {
      message = String(err);
    }
  }

  return minimalResponse(requestCtx, status, text, message, COLOR_500, '600px');
}

function minimalResponse(
  requestCtx: QwikCityRequestContext,
  status: number,
  text: string,
  message: string | null,
  color: string,
  width: string
) {
  const { response } = requestCtx;
  const html = `<!DOCTYPE html>
<html data-qwik-city-status="${status}">
<head>
  <meta charset="utf-8">
  <title>${status} ${text}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body { color: ${color}; background-color: #fafafa; padding: 30px; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Roboto, sans-serif; }
    p { max-width: ${width}; margin: 60px auto 30px auto; background: white; border-radius: 5px; box-shadow: 0px 0px 50px -20px ${color}; overflow: hidden; }
    strong { display: inline-block; padding: 15px; background: ${color}; color: white; }
    span { display: inline-block; padding: 15px; }
    pre { max-width: 580px; margin: 0 auto; }
  </style>
</head>
<body>
  <p>
    <strong>${status}</strong>
    <span>${text}</span>
  </p>
  ${message ? `<pre><code>${message}</code></pre>` : ``}
</body>
</html>
`;

  const headers = new Headers();
  headers.set('Content-Type', 'text/html; charset=utf-8');

  return response(status, headers, async (stream) => {
    stream.write(html);
  });
}

const COLOR_400 = '#5249d9';
const COLOR_500 = '#bd16bd';
