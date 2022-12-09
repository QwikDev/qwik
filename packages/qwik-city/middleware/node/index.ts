import type { RenderOptions } from '@builder.io/qwik';
import type { Render } from '@builder.io/qwik/server';
import { getNotFound } from '@qwik-city-not-found-paths';
import qwikCityPlan from '@qwik-city-plan';
import { isStaticPath } from '@qwik-city-static-paths';
import { createReadStream } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { errorHandler, requestHandler } from '../request-handler';
import type { QwikCityHandlerOptions } from '../request-handler/types';
import { fromNodeHttp, getUrl } from './http';
import { patchGlobalFetch } from './node-fetch';

// @builder.io/qwik-city/middleware/node

/**
 * @alpha
 */
export function createQwikCity(opts: QwikCityNodeRequestOptions) {
  patchGlobalFetch();

  const staticFolder =
    opts.static?.root ?? join(fileURLToPath(import.meta.url), '..', '..', 'dist');

  const router = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: NodeRequestNextFunction
  ) => {
    try {
      const requestCtx = fromNodeHttp(getUrl(req), req, res, 'server');
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
      const url = getUrl(req);
      const notFoundHtml = getNotFound(url.pathname);
      res.writeHead(404, {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Not-Found': url.pathname,
      });
      res.end(notFoundHtml);
    } catch (e) {
      console.error(e);
      next(e);
    }
  };

  const staticFile = async (req: IncomingMessage, res: ServerResponse, next: (e?: any) => void) => {
    try {
      const url = getUrl(req);

      if (isStaticPath(url.pathname)) {
        const target = join(staticFolder, url.pathname);
        const stream = createReadStream(target);

        if (opts.static?.cacheControl) {
          res.setHeader('Cache-Control', opts.static.cacheControl);
        }

        stream.on('error', next);
        stream.pipe(res);

        return;
      }

      return next();
    } catch (e) {
      console.error(e);
      next(e);
    }
  };

  return {
    router,
    notFound,
    staticFile,
  };
}

/**
 * @alpha
 */
export interface QwikCityNodeRequestOptions extends QwikCityHandlerOptions {
  /** Options for serving static files */
  static?: {
    /** The root folder for statics files. Defaults to /dist */
    root?: string;
    /** Set the Cache-Control header for all static files */
    cacheControl?: string;
  };
}

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
