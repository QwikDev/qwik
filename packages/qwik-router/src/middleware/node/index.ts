import { isDev } from '@qwik.dev/core';
import { setServerPlatform } from '@qwik.dev/core/server';
import type { ClientConn, ServerRenderOptions } from '@qwik.dev/router/middleware/request-handler';
import { isStaticPath, requestHandler } from '@qwik.dev/router/middleware/request-handler';
import { createReadStream } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Http2ServerRequest } from 'node:http2';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIME_TYPES } from '../request-handler/mime-types';
import { computeOrigin, fromNodeHttp, getUrl } from './http';

// @qwik.dev/router/middleware/node

/** @public */
export interface QwikRouterNodeMiddleware {
  router: (
    req: IncomingMessage | Http2ServerRequest,
    res: ServerResponse,
    next: NodeRequestNextFunction
  ) => Promise<void>;
  /** @deprecated `router` handles 404 responses. Will be removed in V3. */
  notFound: (
    req: IncomingMessage | Http2ServerRequest,
    res: ServerResponse,
    next: (e: any) => void
  ) => Promise<void>;
  staticFile: (
    req: IncomingMessage | Http2ServerRequest,
    res: ServerResponse,
    next: (e?: any) => void
  ) => Promise<void>;
}

/** @public */
export function createQwikRouter(
  opts: QwikRouterNodeRequestOptions | QwikCityNodeRequestOptions
): QwikRouterNodeMiddleware {
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
      // In dev mode, inject platform from options via secret property
      if (isDev && (opts as any).platform) {
        Object.assign(serverRequestEv.platform, (opts as any).platform);
      }
      const handled = await requestHandler(serverRequestEv, opts);
      if (handled) {
        const err = await handled.completion;
        if (handled.requestEv.headersSent) {
          return;
        }
        if (err) {
          throw err;
        }
      }
      next();
    } catch (e) {
      console.error(e);
      next(e);
    }
  };

  /** @deprecated `router` handles 404 responses. Will be removed in V3. */
  const notFound = async (
    _req: IncomingMessage | Http2ServerRequest,
    _res: ServerResponse,
    next: (e?: any) => void
  ) => next();

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
