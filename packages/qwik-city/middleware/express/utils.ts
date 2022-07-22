import { Readable } from 'stream';
import type { ServerResponse } from 'http';

export async function fromNodeRequest(url: URL, nodeReq: NodeRequest) {
  const headers = new URLSearchParams();
  const nodeHeaders = nodeReq.headers;
  if (nodeHeaders) {
    for (const key in nodeHeaders) {
      const value = nodeHeaders[key];
      if (typeof value === 'string') {
        headers.set(key.toLocaleLowerCase(), value);
      } else if (Array.isArray(value)) {
        for (const v of value) {
          headers.append(key.toLocaleLowerCase(), v);
        }
      }
    }
  }

  let body: string | undefined = undefined;
  const contentType = headers.get('content-type');
  if (contentType === 'application/x-www-form-urlencoded') {
    try {
      const buffers = [];
      for await (const chunk of nodeReq as any) {
        buffers.push(chunk);
      }
      if (buffers.length > 0) {
        body = Buffer.concat(buffers).toString();
      }
    } catch (e) {
      console.error('convertNodeRequest', e);
    }
  }

  const request = new Request(url, {
    method: nodeReq.method,
    headers,
    body,
  });

  if (typeof request.formData !== 'function') {
    request.formData = async function formData() {
      const formData: FormData = new URLSearchParams(body);
      return formData;
    };
  }

  return request;
}

export function toNodeResponse(response: Response, nodeRes: ServerResponse): ServerResponse {
  nodeRes.statusCode = response.status;
  response.headers.forEach((value, key) => nodeRes.setHeader(key, value));

  if ((response.status < 300 || response.status >= 400) && response.body) {
    if (
      typeof response.body === 'string' ||
      response.body instanceof Buffer ||
      response.body instanceof Uint8Array
    ) {
      nodeRes.write(response.body);
    } else if (response.body instanceof Readable) {
      return response.body.pipe(nodeRes, {end: true});
    }
  }
  return nodeRes;
}

export interface NodeRequest {
  url?: string;
  protocol?: string;
  headers?: Record<string, string | string[] | undefined>;
  method?: string;
}
