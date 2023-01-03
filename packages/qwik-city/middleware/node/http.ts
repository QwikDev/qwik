import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  ServerRequestMode,
  ServerRequestEvent,
} from '@builder.io/qwik-city/middleware/request-handler';

export function getUrl(req: IncomingMessage) {
  const protocol =
    (req.socket as any).encrypted || (req.connection as any).encrypted ? 'https' : 'http';
  return new URL(req.url || '/', `${protocol}://${req.headers.host}`);
}

export async function fromNodeHttp(
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
  mode: ServerRequestMode
) {
  const requestHeaders = new Headers();
  const nodeRequestHeaders = req.headers;
  for (const key in nodeRequestHeaders) {
    const value = nodeRequestHeaders[key];
    if (typeof value === 'string') {
      requestHeaders.set(key, value);
    } else if (Array.isArray(value)) {
      for (const v of value) {
        requestHeaders.append(key, v);
      }
    }
  }

  const getRequestBody = async function* () {
    for await (const chunk of req as any) {
      yield chunk;
    }
  };

  const body = req.method === 'HEAD' || req.method === 'GET' ? undefined : getRequestBody();
  const serverRequestEv: ServerRequestEvent<boolean> = {
    mode,
    url,
    request: new (Request as any)(url.href, {
      method: req.method,
      headers: requestHeaders,
      body,
      duplex: 'half',
    }) as any,
    getWritableStream: (status, headers, cookies) => {
      res.statusCode = status;
      headers.forEach((value, key) => res.setHeader(key, value));
      const cookieHeaders = cookies.headers();
      if (cookieHeaders.length > 0) {
        res.setHeader('Set-Cookie', cookieHeaders);
      }
      const stream = new WritableStream<Uint8Array>({
        write(chunk) {
          res.write(chunk);
        },
        close() {
          return new Promise((resolve) => res.end(resolve));
        },
      });
      return stream;
    },
    platform: {
      ssr: true,
      node: process.versions.node,
    },
    locale: undefined,
  };

  return serverRequestEv;
}
