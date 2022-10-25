import type { IncomingMessage, ServerResponse } from 'node:http';
import type { QwikCityHandlerOptions } from '../request-handler/types';
import { errorHandler, notFoundHandler, requestHandler } from '../request-handler';
import { fromNodeHttp, getUrl } from './http';
import { patchGlobalFetch } from './node-fetch';
import type { Render } from '@builder.io/qwik/server';
import type { RenderOptions } from '@builder.io/qwik';
import qwikCityPlan from '@qwik-city-plan';

// @builder.io/qwik-city/middleware/node

/**
 * @alpha
 */
export function createQwikCity(opts: QwikCityNodeRequestOptions) {
  patchGlobalFetch();

  const router = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: NodeRequestNextFunction
  ) => {
    try {
      const requestCtx = fromNodeHttp(getUrl(req), req, res);
      try {
        const rsp = await requestHandler(requestCtx, opts);
        if (!rsp) {
          next();
        }
      } catch (e) {
        await errorHandler(requestCtx, e);
      }
    } catch (e) {
      console.error(e);
      next(e);
    }
  };

  const notFound = async (req: IncomingMessage, res: ServerResponse, next: (e: any) => void) => {
    try {
      const requestCtx = fromNodeHttp(getUrl(req), req, res);
      await notFoundHandler(requestCtx);
    } catch (e) {
      console.error(e);
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
export interface QwikCityNodeRequestOptions extends QwikCityHandlerOptions {}

/**
 * @alpha
 */ export interface NodeRequestNextFunction {
  (err?: any): void;
}

/**
 * @alpha
 * @deprecated Please use `createQwikCity()` instead.
 *
 * Example:
 *
 * ```ts
 * import { createQwikCity } from '@builder.io/qwik-city/middleware/node';
 * import qwikCityPlan from '@qwik-city-plan';
 * import render from './entry.ssr';
 *
 * const { router, notFound } = createQwikCity({ render, qwikCityPlan });
 * ```
 */
export function qwikCity(render: Render, opts?: RenderOptions) {
  return createQwikCity({ render, qwikCityPlan, ...opts });
}
