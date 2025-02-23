/** @public */
export class ServerError<T = any> extends Error {
  constructor(
    public status: number,
    public data: T
  ) {
    super(typeof data === 'string' ? data : undefined);
  }
}

/** @deprecated */
export class ErrorResponse extends ServerError {
  constructor(
    public status: number,
    message?: string
  ) {
    super(status, message);
  }
}

/** @public */
export function getErrorHtml(status: number, e: any) {
  let message = 'Server Error';

  if (e != null) {
    if (typeof e.message === 'string') {
      message = e.message;
    } else {
      message = String(e);
    }
  }

  return `<html>` + minimalHtmlResponse(status, message) + `</html>`;
}

export function minimalHtmlResponse(status: number, message?: string) {
  if (typeof status !== 'number') {
    status = 500;
  }
  if (typeof message === 'string') {
    message = escapeHtml(message);
  } else {
    message = '';
  }
  const width = typeof message === 'string' ? '600px' : '300px';
  const color = status >= 500 ? COLOR_500 : COLOR_400;
  return `
<head>
  <meta charset="utf-8">
  <meta http-equiv="Status" content="${status}">
  <title>${status} ${message}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body { color: ${color}; background-color: #fafafa; padding: 30px; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Roboto, sans-serif; }
    p { max-width: ${width}; margin: 60px auto 30px auto; background: white; border-radius: 4px; box-shadow: 0px 0px 50px -20px ${color}; overflow: hidden; }
    strong { display: inline-block; padding: 15px; background: ${color}; color: white; }
    span { display: inline-block; padding: 15px; }
  </style>
</head>
<body><p><strong>${status}</strong> <span>${message}</span></p></body>
`;
}
const ESCAPE_HTML = /[&<>]/g;

const escapeHtml = (s: string) => {
  return s.replace(ESCAPE_HTML, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      default:
        return '';
    }
  });
};

const COLOR_400 = '#006ce9';
const COLOR_500 = '#713fc2';
