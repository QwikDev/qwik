import type { QwikManifest } from '@qwik.dev/core/optimizer';
import type { Render } from '@qwik.dev/core/server';
import type { QwikCityPlan, QwikRouterConfig } from '@qwik.dev/router';
import { createQwikRouter as createQwikRouterNode } from '@qwik.dev/router/middleware/node';
import type { ServerRenderOptions } from '@qwik.dev/router/middleware/request-handler';

interface AwsOpt {
  render: Render;
  manifest?: QwikManifest;
  qwikRouterConfig: QwikRouterConfig;
  /** @deprecated Use `QwikRouterConfig` instead. Will be removed in V3 */
  qwikCityPlan?: QwikCityPlan;
}

/** @public */
export function createQwikRouter(opts: AwsOpt) {
  if (opts.qwikCityPlan && !opts.qwikRouterConfig) {
    console.warn('qwikCityPlan is deprecated. Use qwikRouterConfig instead.');
    opts.qwikRouterConfig = opts.qwikCityPlan;
  } else if (!opts.qwikRouterConfig) {
    throw new Error('qwikRouterConfig is required.');
  }
  try {
    const { router, staticFile, notFound } = createQwikRouterNode({
      render: opts.render,
      qwikRouterConfig: opts.qwikRouterConfig,
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
      if (opts.qwikRouterConfig.trailingSlash) {
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
        router(req, res, () => {
          notFound(req, res, () => {});
        });
      });
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
