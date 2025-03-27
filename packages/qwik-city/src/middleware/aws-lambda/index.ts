import { createQwikCity as createQwikCityNode } from '@builder.io/qwik-city/middleware/node';
import type { ServerRenderOptions } from '@builder.io/qwik-city/middleware/request-handler';
import type { QwikCityPlan } from 'packages/qwik-city/src/runtime/src/types';
import type { QwikManifest, Render } from 'packages/qwik/src/server/types';

interface AwsOpt {
  render: Render;
  manifest?: QwikManifest;
  qwikCityPlan: QwikCityPlan;
}

/** @public */
export function createQwikCity(opts: AwsOpt) {
  try {
    const { router, staticFile, notFound } = createQwikCityNode({
      render: opts.render,
      qwikCityPlan: opts.qwikCityPlan,
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
      if (opts.qwikCityPlan.trailingSlash) {
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

/** @public */
export interface QwikCityAwsLambdaOptions extends ServerRenderOptions {}

/** @public */
export interface PlatformAwsLambda extends Object {}
