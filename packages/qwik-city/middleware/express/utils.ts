import { Headers as HeadersPolyfill } from 'headers-polyfill';
import type { ServerResponse } from 'http';
import type { ServerRequestEvent } from '../request-handler/types';

export function fromNodeHttp(url: URL, nodeReq: NodeRequest, nodeRes: ServerResponse) {
  const requestHeaders = new (typeof Headers === 'function' ? Headers : HeadersPolyfill)();
  const nodeRequestHeaders = nodeReq.headers;
  if (nodeRequestHeaders) {
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
  }

  const getRequestBody = async () => {
    const buffers = [];
    for await (const chunk of nodeReq as any) {
      buffers.push(chunk);
    }
    return Buffer.concat(buffers).toString();
  };

  const serverRequestEv: ServerRequestEvent = {
    request: {
      headers: requestHeaders,
      formData: async () => {
        return new URLSearchParams(await getRequestBody());
      },
      json: async () => {
        return JSON.parse(await getRequestBody()!);
      },
      method: nodeReq.method || 'GET',
      text: getRequestBody,
      url: url.href,
    },
    response: (status, headers, body) => {
      nodeRes.statusCode = status;
      headers.forEach((value, key) => nodeRes.setHeader(key, value));
      body({
        write: (chunk) => nodeRes.write(chunk),
      }).finally(() => {
        nodeRes.end();
      });
      return nodeRes;
    },
    url,
  };

  return serverRequestEv;
}

export interface NodeRequest {
  url?: string;
  protocol?: string;
  headers?: Record<string, string | string[] | undefined>;
  method?: string;
}
