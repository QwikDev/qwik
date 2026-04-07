import type { QwikManifest } from '@qwik.dev/core/optimizer';
import type { Render } from '@qwik.dev/core/server';
import { createQwikRouter as createQwikRouterNode } from '@qwik.dev/router/middleware/node';
import type { NodeRequestNextFunction } from '@qwik.dev/router/middleware/node';
import type { ServerRenderOptions } from '@qwik.dev/router/middleware/request-handler';
import type { Http2ServerRequest } from 'node:http2';
import type { IncomingMessage, ServerResponse } from 'node:http';

interface AwsOpt {
  render: Render;
  manifest?: QwikManifest;
}

/** @public */
export interface QwikRouterAwsLambdaMiddleware {
  fixPath: (pathT: string) => string;
  router: (
    req: IncomingMessage | Http2ServerRequest,
    res: ServerResponse,
    next: NodeRequestNextFunction
  ) => Promise<void>;
  staticFile: (
    req: IncomingMessage | Http2ServerRequest,
    res: ServerResponse,
    next: (e?: any) => void
  ) => Promise<void>;
  /** @deprecated `router` handles 404 responses. Will be removed in V3. */
  notFound: (
    req: IncomingMessage | Http2ServerRequest,
    res: ServerResponse,
    next: (e?: any) => void
  ) => Promise<void>;
  handle: (req: any, res: any) => void;
}

/** @public */
export function createQwikRouter(opts: AwsOpt): QwikRouterAwsLambdaMiddleware {
  try {
    const { router, staticFile } = createQwikRouterNode({
      render: opts.render,
      manifest: opts.manifest,
      static: {
        cacheControl: 'public, max-age=31557600',
      },
      getOrigin(req) {
        if (process.env.IS_OFFLINE) {
          return `http://${req.headers.host}`;
        }
        return null;
      },
    });

    const fixPath = (pathT: string) => {
      if (!globalThis.__NO_TRAILING_SLASH__) {
        const url = new URL(pathT, 'http://aws-qwik.local');
        if (url.pathname.includes('.', url.pathname.lastIndexOf('/'))) {
          return pathT;
        }
        if (!url.pathname.endsWith('/')) {
          return url.pathname + '/' + url.search;
        }
      }
      return pathT;
    };

    const handle = (req: any, res: any) => {
      req.url = fixPath(req.url);
      staticFile(req, res, () => {
        router(req, res, () => {});
      });
    };

    /** @deprecated `router` handles 404 responses. Will be removed in V3. */
    const notFound = async (_req: any, _res: any, next: (e?: any) => void) => {
      next();
    };

    return { fixPath, router, staticFile, notFound, handle };
  } catch (err: any) {
    throw new Error(err.message);
  }
}

/**
 * @deprecated Use `createQwikRouter` instead. Will be removed in V3
 * @public
 */
export const createQwikCity = createQwikRouter;

/** @public */
export interface QwikRouterAwsLambdaOptions extends ServerRenderOptions {}

/**
 * @deprecated Use `QwikRouterAwsLambdaOptions` instead. Will be removed in V3
 * @public
 */
export type QwikCityAwsLambdaOptions = QwikRouterAwsLambdaOptions;

/** @public */
export interface PlatformAwsLambda extends Object {}
