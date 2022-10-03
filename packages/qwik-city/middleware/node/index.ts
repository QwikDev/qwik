import type { Render } from '@builder.io/qwik/server';
import type { IncomingMessage, ServerResponse } from 'http';
import type { QwikCityRequestOptions } from '../request-handler/types';
import { errorHandler, notFoundHandler, requestHandler } from '../request-handler';
import { fromNodeHttp, getUrl } from './http';
import { patchGlobalFetch } from './node-fetch';

// @builder.io/qwik-city/middleware/node

/**
 * @alpha
 */
export function qwikCity(render: Render, opts?: QwikCityNodeRequestOptions) {
  patchGlobalFetch();

  const router = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: NodeRequestNextFunction
  ) => {
    try {
      const requestCtx = fromNodeHttp(getUrl(req), req, res);
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

  const notFound = async (req: IncomingMessage, res: ServerResponse, next: (e: any) => void) => {
    try {
      const requestCtx = fromNodeHttp(getUrl(req), req, res);
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
 * @alpha
 */
export interface QwikCityNodeRequestOptions extends QwikCityRequestOptions {}

/**
 * @alpha
 */ export interface NodeRequestNextFunction {
  (err?: any): void;
}
