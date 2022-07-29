import type { ResponseHandler } from './types';

export function notFoundResponse(response: ResponseHandler, headers?: Headers) {
  return fallbackResponse(404, headers, 'Not Found', null, response);
}

export function errorResponse(response: ResponseHandler, e: any, headers?: Headers) {
  let text = 'Server Error';
  let message: string | null = null;

  if (e) {
    if (e instanceof Error) {
      if (typeof e.message === 'string') {
        text = e.message;
      }
      if (typeof e.stack === 'string') {
        message = e.stack;
      }
    } else {
      message = String(e);
    }
  }

  return fallbackResponse(500, headers, text, message, response);
}

function fallbackResponse(
  status: number,
  headers: Headers | undefined,
  text: string,
  message: string | null,
  response: ResponseHandler
) {
  headers = headers || new URLSearchParams();
  headers.set('Content-Type', 'text/html; charset=utf-8');

  const html = `<!DOCTYPE html>
<html data-qwik-city-status="${status}">
<head>
  <meta charset="utf-8" />
  <title>${status} ${text}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    body {
      --color: #5249d9;
      color: var(--color);
      background-color: rgb(250, 250, 250);
      padding: 20px;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
        Roboto, "Helvetica Neue", sans-serif;
    }
    p {
      max-width: ${message ? `600px` : `400px`};
      margin: 60px auto 30px auto;
      background-color: white;
      border-radius: 5px;
      box-shadow: 0px 0px 50px -20px var(--color);
      overflow: hidden;
    }
    strong {
      display: inline-block;
      padding: 15px;
      background-color: var(--color);
      color: white;
    }
    span {
      display: inline-block;
      padding: 15px;
    }
    pre {
      max-width: 580px;
      margin: 0 auto;
    }
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

  return response(status, headers, async (stream) => {
    stream.write(html);
  });
}
