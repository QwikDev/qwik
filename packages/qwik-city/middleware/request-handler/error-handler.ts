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

  return `<script>
    window.location.href = '/errors/err-${status}-page';
  </script>`;
}
