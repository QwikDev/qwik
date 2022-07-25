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
  const contentType = requestHeaders.get('Content-Type');
  if (contentType === 'application/x-www-form-urlencoded') {
    try {
      const buffers = [];
      for await (const chunk of nodeReq as any) {
        buffers.push(chunk);
      }
      if (buffers.length > 0) {
        requestBody = Buffer.concat(buffers).toString();
      }
    } catch (e) {
      console.error('convertNodeRequest', e);
    }
  }

  const serverRequestEv: ServerRequestEvent = {
    request: new Request(url, {
      method: nodeReq.method,
      headers: requestHeaders,
      body: requestBody,
    }),
    response: {
      headers: new HeadersPolyfill(),
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
