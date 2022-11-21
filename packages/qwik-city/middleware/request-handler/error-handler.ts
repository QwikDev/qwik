import { Cookie } from './cookie';
import { createHeaders } from './headers';
import { HttpStatus } from './http-status-codes';
import type { QwikCityRequestContext } from './types';

export class ErrorResponse extends Error {
  constructor(public status: number, message?: string) {
    super(message);
  }
}

export function notFoundHandler<T = any>(requestCtx: QwikCityRequestContext): Promise<T> {
  return errorResponse(requestCtx, new ErrorResponse(404, 'Not Found'));
}

export function errorHandler(requestCtx: QwikCityRequestContext, e: any) {
  const status = HttpStatus.InternalServerError;
  const html = getErrorHtml(status, e);
  const headers = createHeaders();
  headers.set('Content-Type', 'text/html; charset=utf-8');

  return requestCtx.response(
    status,
    headers,
    new Cookie(),
    async (stream) => {
      stream.write(html);
    },
    e
  );
}

export function errorResponse(requestCtx: QwikCityRequestContext, errorResponse: ErrorResponse) {
  const html = minimalHtmlResponse(
    errorResponse.status,
    errorResponse.message,
    errorResponse.stack
  );

  const headers = createHeaders();
  headers.set('Content-Type', 'text/html; charset=utf-8');

  return requestCtx.response(
    errorResponse.status,
    headers,
    new Cookie(),
    async (stream) => {
      stream.write(html);
    },
    errorResponse
  );
}

export function getErrorHtml(status: number, e: any) {
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

  return minimalHtmlResponse(status, message, stack);
}

function minimalHtmlResponse(status: number, message?: string, stack?: string) {
  const width = typeof message === 'string' ? '600px' : '300px';
  const color = status >= 500 ? COLOR_500 : COLOR_400;
  if (status < 500) {
    stack = '';
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Status" content="${status}"/>
  <title>${status} ${message}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body { color: ${color}; background-color: #fafafa; padding: 30px; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Roboto, sans-serif; }
    p { max-width: ${width}; margin: 60px auto 30px auto; background: white; border-radius: 4px; box-shadow: 0px 0px 50px -20px ${color}; overflow: hidden; }
    strong { display: inline-block; padding: 15px; background: ${color}; color: white; }
    span { display: inline-block; padding: 15px; }
    pre { max-width: 580px; margin: 0 auto; }
  </style>
</head>
<body>
  <p><strong>${status}</strong> <span>${message}</span></p>${
    stack ? `\n  <pre><code>${stack}</code></pre>` : ``
  }
</body>
</html>`;
}

const COLOR_400 = '#006ce9';
const COLOR_500 = '#713fc2';
