import type { ResponseHandler } from './types';

export function notFoundResponse(response: ResponseHandler) {
  const headers = new URLSearchParams({
    'Content-Type': 'text/html; charset=utf-8',
  });

  return response(404, headers, async (stream) => {
    stream.write(NOT_FOUND_HTML);
  });
}

export function errorResponse(e: any, response: ResponseHandler) {
  return response(
    500,
    new URLSearchParams({ 'Content-Type': 'text/plain; charset=utf-8' }),
    async (stream) => {
      stream.write(String(e ? e.stack || e : 'Request Handler Error'));
    }
  );
}

const NOT_FOUND_HTML = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>404 Not Found</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>
      body { background-color: rgb(250, 250, 250); color: #006eb3; padding: 20px; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', sans-serif; }
      p { max-width: 220px; margin: 80px auto; padding: 15px 30px; background-color: white; border-radius: 10px; box-shadow: 0px 0px 50px -20px #5249d9; }
      strong { padding-right: 20px; }
    </style>
  </head>
  <body>
    <p>
      <strong id="qwik-city-response-status">404</strong>
      <span>Not Found</span>
    </p>
  </body>
</html>`;
