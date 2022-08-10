import { createHeaders } from './headers';
import { HttpStatus } from './http-status-codes';
import type { QwikCityRequestContext } from './types';

export class ErrorResponse extends Error {
  constructor(public status: number, message?: string) {
    super(message);
  }
}

export function notFoundHandler<T = any>(requestCtx: QwikCityRequestContext): Promise<T> {
  const status = HttpStatus.NotFound;
  const message = 'Not Found';
  return minimalHtmlResponse(requestCtx, status, message);
}

export function errorHandler(requestCtx: QwikCityRequestContext, e: any) {
  const status = HttpStatus.InternalServerError;
  let message = 'Server Error';
  let stack: string | undefined = undefined;

  if (e != null) {
    if (typeof e === 'object') {
      if (typeof e.message === 'string') {
        message = e.message;
      }
      if (e.stack != null) {
        stack = String(e.stack);
      }
    } else {
      message = String(e);
    }
  }

  return minimalHtmlResponse(requestCtx, status, message, stack);
}

export function errorResponse(requestCtx: QwikCityRequestContext, errorResponse: ErrorResponse) {
  return minimalHtmlResponse(
    requestCtx,
    errorResponse.status,
    errorResponse.message,
    errorResponse.stack
  );
}

function minimalHtmlResponse(
  requestCtx: QwikCityRequestContext,
  status: number,
  message?: string,
  stack?: string
) {
  const { response } = requestCtx;
  const width = typeof message === 'string' ? '600px' : '300px';
  const color = status >= 500 ? COLOR_500 : COLOR_400;
  const html = `<!DOCTYPE html>
<html data-qwik-city-status="${status}">
<head>
  <meta charset="utf-8">
  <title>${status} ${message}</title>
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
    <span>${message}</span>
  </p>
  ${stack ? `<pre><code>${stack}</code></pre>` : ``}
</body>
</html>
`;

  const headers = createHeaders();
  headers.set('Content-Type', 'text/html; charset=utf-8');

  return response(status, headers, async (stream) => {
    stream.write(html);
  });
}

const COLOR_400 = '#5249d9';
const COLOR_500 = '#bd16bd';
