import { Headers as HeadersPolyfill } from 'headers-polyfill';
import type { ServerResponse } from 'http';
import type { ServerRequestEvent } from '../request-handler/types';

export async function fromNodeHttp(url: URL, nodeReq: NodeRequest, nodeRes: ServerResponse) {
  const requestHeaders = new HeadersPolyfill();
  const nodeHeaders = nodeReq.headers;
  if (nodeHeaders) {
    for (const key in nodeHeaders) {
      const value = nodeHeaders[key];
      if (typeof value === 'string') {
        requestHeaders.set(key, value);
      } else if (Array.isArray(value)) {
        for (const v of value) {
          requestHeaders.append(key, v);
        }
      }
    }
  }

  let requestBody: string | undefined = undefined;
  const requestContentType = requestHeaders.get('Content-Type');
  if (requestContentType === 'application/x-www-form-urlencoded') {
    try {
      const buffers = [];
      for await (const chunk of nodeReq as any) {
        buffers.push(chunk);
      }
      if (buffers.length > 0) {
        requestBody = Buffer.concat(buffers).toString();
      }
    } catch (e) {
      console.error('convertNodeRequestHeaders', e);
    }
  }

  const getResponseHeader = (key: string) => {
    const value = nodeRes.getHeader(key);
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    return null;
  };

  const responseHeaders: Headers = {
    append(key, value) {
      const existingValue = getResponseHeader(key);
      nodeRes.setHeader(key, existingValue !== null ? `${existingValue}, ${value}` : value);
    },
    delete(key) {
      nodeRes.removeHeader(key);
    },
    forEach(cb) {
      const keys = nodeRes.getHeaderNames();
      for (const key of keys) {
        const value = getResponseHeader(key)!;
        cb(value, key, responseHeaders);
      }
    },
    get: getResponseHeader,
    has(key) {
      return nodeRes.hasHeader(key);
    },
    set(key, value) {
      nodeRes.setHeader(key, value);
    },
  };

  const serverRequestEv: ServerRequestEvent = {
    request: new Request(url, {
      method: nodeReq.method,
      headers: requestHeaders,
      body: requestBody,
    }),
    response: {
      headers: responseHeaders,
      status(code) {
        nodeRes.statusCode = code;
      },
      get statusCode() {
        return nodeRes.statusCode;
      },
      redirect(url, statusCode) {
        nodeRes.statusCode = typeof statusCode === 'number' ? statusCode : 307;
        nodeRes.setHeader('Location', url);
        serverRequestEv.response.handled = true;
      },
      write(chunk) {
        nodeRes.write(chunk);
      },
      body: undefined,
      handled: false,
    },
    url,
  };

  if (typeof serverRequestEv.request.formData !== 'function') {
    serverRequestEv.request.formData = async function formData() {
      const formData: FormData = new URLSearchParams(requestBody);
      return formData;
    };
  }

  return serverRequestEv;
}

export interface NodeRequest {
  url?: string;
  protocol?: string;
  headers?: Record<string, string | string[] | undefined>;
  method?: string;
}
