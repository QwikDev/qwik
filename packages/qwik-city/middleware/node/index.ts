import type { ServerRenderOptions, ClientInfo } from '@builder.io/qwik-city/middleware/request-handler';
import { requestHandler } from '@builder.io/qwik-city/middleware/request-handler';
import { setServerPlatform } from '@builder.io/qwik/server';
import { getNotFound } from '@qwik-city-not-found-paths';
import { isStaticPath } from '@qwik-city-static-paths';
import { createReadStream } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromNodeHttp, getUrl } from './http';
import { MIME_TYPES } from '../request-handler/mime-types';
import { patchGlobalThis } from './node-fetch';
import { _deserializeData, _serializeData, _verifySerializable } from '@builder.io/qwik';

// @builder.io/qwik-city/middleware/node

/**
 * @public
 */
export function createQwikCity(opts: QwikCityNodeRequestOptions) {
  // Patch Stream APIs
  patchGlobalThis();

  const qwikSerializer = {
    _deserializeData,
    _serializeData,
    _verifySerializable,
  };
  if (opts.manifest) {
    setServerPlatform(opts.manifest);
  }
  const staticFolder =
    opts.static?.root ?? join(fileURLToPath(import.meta.url), '..', '..', 'dist');

  const router = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: NodeRequestNextFunction
  ) => {
    try {
      const serverRequestEv = await fromNodeHttp(
        getUrl(req, opts.origin),
        req,
        res,
        'server',
        opts.getClientInfo
      );
      const handled = await requestHandler(serverRequestEv, opts, qwikSerializer);
      if (handled) {
        const err = await handled.completion;
        if (err) {
          throw err;
        }
        if (handled.requestEv.headersSent) {
          return;
        }
      }
      next();
    } catch (e) {
      console.error(e);
      next(e);
    }
  };

  const notFound = async (req: IncomingMessage, res: ServerResponse, next: (e: any) => void) => {
    try {
      if (!res.headersSent) {
        const url = getUrl(req, opts.origin);
        const notFoundHtml = getNotFound(url.pathname);
        res.writeHead(404, {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Not-Found': url.pathname,
        });
        res.end(notFoundHtml);
      }
    } catch (e) {
      console.error(e);
      next(e);
    }
  };

  const staticFile = async (req: IncomingMessage, res: ServerResponse, next: (e?: any) => void) => {
    try {
      const url = getUrl(req);

      if (isStaticPath(req.method || 'GET', url)) {
        const target = join(staticFolder, url.pathname);
        const stream = createReadStream(target);
        const ext = extname(url.pathname).replace(/^\./, '');

        const contentType = MIME_TYPES[ext];

        if (contentType) {
          res.setHeader('Content-Type', contentType);
        }

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
 * @public
 */
export interface PlatformNode {
  ssr?: true;
  incomingMessage?: IncomingMessage;
  node?: string;
}

/**
 * @public
 */
export interface QwikCityNodeRequestOptions extends ServerRenderOptions {
  /** Options for serving static files */
  static?: {
    /** The root folder for statics files. Defaults to /dist */
    root?: string;
    /** Set the Cache-Control header for all static files */
    cacheControl?: string;
  };
  /**
   * Origin of the server, used to resolve relative URLs and validate the request origin against CSRF attacks.
   *
   * When not specified, it defaults to the `ORIGIN` environment variable (if set) or derived from the incoming request.
   */
  origin?: string;
  getClientInfo?: (req: IncomingMessage) => ClientInfo;
}

/**
 * @public
 */ export interface NodeRequestNextFunction {
  (err?: any): void;
}
