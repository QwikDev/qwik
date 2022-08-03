import type { Render } from '@builder.io/qwik/server';
import type { QwikCityRequestContext, QwikCityRequestOptions } from '../request-handler/types';
import { errorHandler, notFoundHandler, requestHandler } from '../request-handler';
import { patchGlobalFetch } from './node-fetch';
import { Headers } from '../request-handler/headers';
import type { Request, Response, NextFunction } from 'express';

// @builder.io/qwik-city/middleware/express

/**
 * @public
 */
export function qwikCity(render: Render, opts?: QwikCityExpressOptions) {
  patchGlobalFetch();

  const router = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const requestCtx = fromExpressHttp(req, res);
      try {
        const rsp = await requestHandler(requestCtx, render, opts);
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

  const notFound = async (req: Request, res: Response, next: (e: any) => void) => {
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

/**
 * @public
 */
export interface QwikCityExpressOptions extends QwikCityRequestOptions {}

function fromExpressHttp(req: Request, res: Response) {
  const url = new URL(req.path, `${req.protocol}://${req.hostname}`);

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

  const getRequestBody = async () => {
    const buffers = [];
    for await (const chunk of req) {
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
    response: (status, headers, body) => {
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
