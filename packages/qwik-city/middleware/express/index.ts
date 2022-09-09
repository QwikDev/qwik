import type { Render } from '@builder.io/qwik/server';
import type { QwikCityRequestContext, QwikCityRequestOptions } from '../request-handler/types';
import { errorHandler, notFoundHandler, requestHandler } from '../request-handler';
import { patchGlobalFetch } from './node-fetch';
import { createHeaders } from '../request-handler/headers';

// @builder.io/qwik-city/middleware/express

/**
 * @alpha
 */
export function qwikCity(render: Render, opts?: QwikCityExpressOptions) {
  patchGlobalFetch();

  const router = async (req: ExpressRequest, res: ExpressResponse, next: ExpressNextFunction) => {
    try {
      const requestCtx = fromExpressHttp(req, res);
      try {
        const rsp = await requestHandler(requestCtx, render, {}, opts);
        if (!rsp) {
          next();
        }
      } catch (e) {
        await errorHandler(requestCtx, e);
      }
    } catch (e) {
      next(e);
    }
  };

  const notFound = async (req: ExpressRequest, res: ExpressResponse, next: (e: any) => void) => {
    try {
      const requestCtx = fromExpressHttp(req, res);
      await notFoundHandler(requestCtx);
    } catch (e) {
      next(e);
    }
  };

  return {
    router,
    notFound,
  };
}

function fromExpressHttp(req: ExpressRequest, res: ExpressResponse) {
  const url = new URL(req.url, `${req.protocol}://${req.headers.host}`);
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
    response: async (status, headers, body) => {
      res.statusCode = status;
      headers.forEach((value, key) => res.setHeader(key, value));
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
  };

  return requestCtx;
}

/**
 * @alpha
 */
export interface QwikCityExpressOptions extends QwikCityRequestOptions {}

/**
 * @alpha
 */
export interface ExpressRequest {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  protocol: string;
  url: string;
}

/**
 * @alpha
 */
export interface ExpressResponse {
  statusCode: number;
  setHeader: (key: string, value: string) => void;
  write: (chunk: any) => void;
  end: () => void;
}

/**
 * @alpha
 */ export interface ExpressNextFunction {
  (err?: any): void;
}
