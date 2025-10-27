import { setServerPlatform } from '@qwik.dev/core/server';
import type { ClientConn, ServerRenderOptions } from '@qwik.dev/router/middleware/request-handler';
import {
  getNotFound,
  isStaticPath,
  requestHandler,
} from '@qwik.dev/router/middleware/request-handler';
import { createReadStream } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Http2ServerRequest } from 'node:http2';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIME_TYPES } from '../request-handler/mime-types';
import { computeOrigin, fromNodeHttp, getUrl } from './http';

// @qwik.dev/router/middleware/node

/** @public */
export function createQwikRouter(opts: QwikRouterNodeRequestOptions | QwikCityNodeRequestOptions) {
  if (opts.qwikCityPlan && !opts.qwikRouterConfig) {
    console.warn('qwikCityPlan is deprecated. Simply remove it.');
    opts.qwikRouterConfig = opts.qwikCityPlan;
  }

  if (opts.manifest) {
    setServerPlatform(opts.manifest);
  }
  const staticFolder =
    opts.static?.root ?? join(fileURLToPath(import.meta.url), '..', '..', 'dist');

  const router = async (
    req: IncomingMessage | Http2ServerRequest,
    res: ServerResponse,
    next: NodeRequestNextFunction
  ) => {
    try {
      const origin = computeOrigin(req, opts);
      const serverRequestEv = await fromNodeHttp(
        getUrl(req, origin),
        req,
        res,
        'server',
        opts.getClientConn
      );
      const handled = await requestHandler(serverRequestEv, opts);
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

  const notFound = async (
    req: IncomingMessage | Http2ServerRequest,
    res: ServerResponse,
    next: (e: any) => void
  ) => {
    try {
      if (!res.headersSent) {
        const origin = computeOrigin(req, opts);
        const url = getUrl(req, origin);

        // In the development server, we replace the getNotFound function
        // For static paths, we assign a static "Not Found" message.
        // This ensures consistency between development and production environments for specific URLs.
        const notFoundHtml =
          !req.headers.accept?.includes('text/html') || isStaticPath(req.method || 'GET', url)
            ? 'Not Found'
            : getNotFound(url.pathname);
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

  const staticFile = async (
    req: IncomingMessage | Http2ServerRequest,
    res: ServerResponse,
    next: (e?: any) => void
  ) => {
    try {
      const origin = computeOrigin(req, opts);
      const url = getUrl(req, origin);
      if (isStaticPath(req.method || 'GET', url)) {
        const pathname = url.pathname;
        let filePath: string;
        if (basename(pathname).includes('.')) {
          filePath = join(staticFolder, pathname);
        } else if (!globalThis.__NO_TRAILING_SLASH__) {
          filePath = join(staticFolder, pathname + 'index.html');
        } else {
          filePath = join(staticFolder, pathname, 'index.html');
        }
        const ext = extname(filePath).replace(/^\./, '');
        const stream = createReadStream(filePath);
        stream.on('error', next);

        const contentType = MIME_TYPES[ext];

        if (contentType) {
          res.setHeader('Content-Type', contentType);
        }

        if (opts.static?.cacheControl) {
          res.setHeader('Cache-Control', opts.static.cacheControl);
        }

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
 * @deprecated Use `createQwikRouter` instead. Will be removed in V3
 * @public
 */
export const createQwikCity = createQwikRouter;

/** @public */
export interface PlatformNode {
  ssr?: true;
  incomingMessage?: IncomingMessage | Http2ServerRequest;
  node?: string;
}

/** @public */
export interface QwikRouterNodeRequestOptions extends ServerRenderOptions {
  /** Options for serving static files */
  static?: {
    /** The root folder for statics files. Defaults to /dist */
    root?: string;
    /** Set the Cache-Control header for all static files */
    cacheControl?: string;
  };

  /**
   * Provide a function that computes the origin of the server, used to resolve relative URLs and
   * validate the request origin against CSRF attacks.
   *
   * When not specified, it defaults to the `ORIGIN` environment variable (if set).
   *
   * If `ORIGIN` is not set, it's derived from the incoming request, which is not recommended for
   * production use. You can specify the `PROTOCOL_HEADER`, `HOST_HEADER` to `X-Forwarded-Proto` and
   * `X-Forwarded-Host` respectively to override the default behavior.
   */
  getOrigin?: (req: IncomingMessage | Http2ServerRequest) => string | null;

  /** Provide a function that returns a `ClientConn` for the given request. */
  getClientConn?: (req: IncomingMessage | Http2ServerRequest) => ClientConn;

  /** @deprecated Use `getOrigin` instead. Will be removed in V3 */
  origin?: string;
}

/**
 * @deprecated Use `QwikRouterNodeRequestOptions` instead. Will be removed in V3
 * @public
 */
export type QwikCityNodeRequestOptions = QwikRouterNodeRequestOptions;

/** @public */
export interface NodeRequestNextFunction {
  (err?: any): void;
}
