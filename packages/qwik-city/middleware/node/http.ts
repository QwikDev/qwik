import type { IncomingMessage, ServerResponse } from 'node:http';
import type { QwikCityMode } from '../../runtime/src/types';
import type { QwikCityRequestContext } from '../request-handler/types';
import { createHeaders } from '../request-handler/headers';

export function getUrl(req: IncomingMessage) {
  const protocol =
    (req.socket as any).encrypted || (req.connection as any).encrypted ? 'https' : 'http';
  return new URL(req.url || '/', `${protocol}://${req.headers.host}`);
}

export function fromNodeHttp(
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
  mode: QwikCityMode
) {
  const requestHeaders = createHeaders();
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

  const getRequestBody = async () => {
    const buffers = [];
    for await (const chunk of req as any) {
      buffers.push(chunk);
    }
    return Buffer.concat(buffers).toString();
  };

  const requestCtx: QwikCityRequestContext = {
    mode,
    request: {
      headers: requestHeaders,
      formData: async () => {
        return new URLSearchParams(await getRequestBody());
      },
      json: async () => {
        return JSON.parse(await getRequestBody()!);
      },
      method: req.method || 'GET',
      text: getRequestBody,
      url: url.href,
    },
    response: async (status, headers, cookies, body) => {
      res.statusCode = status;
      headers.forEach((value, key) => res.setHeader(key, value));
      const cookieHeaders = cookies.headers();
      if (cookieHeaders.length > 0) {
        res.setHeader('Set-Cookie', cookieHeaders);
      }
      body({
        write: (chunk) => {
          res.write(chunk);
        },
      }).finally(() => {
        res.end();
      });
      return res;
    },
    url,
    platform: {
      ssr: true,
      node: process.versions.node,
    },
    locale: undefined,
  };

  return requestCtx;
}
