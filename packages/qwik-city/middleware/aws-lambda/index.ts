import 'source-map-support/register';
import serverless from 'serverless-http';
import { createQwikCity as createQwikCityNode } from '@builder.io/qwik-city/middleware/node';
import type { ServerRenderOptions } from '@builder.io/qwik-city/middleware/request-handler';

/**
 * @public
 */
export function createQwikCity(opts: any) {
  try {
    const { router, staticFile, notFound } = createQwikCityNode({
      render: opts.render,
      manifest: opts.manifest,
      qwikCityPlan: opts.qwikCityPlan,
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

    const qwikApp = serverless(
      {
        handle: (req: any, res: any) => {
          req.url = fixPath(req.url);
          staticFile(req, res, () => {
            router(req, res, () => {
              notFound(req, res, () => {});
            });
          });
        },
      },
      {
        binary: true,
      }
    );

    const fixPath = (path: string) => {
      if (opts.qwikCityPlan.trailingSlash) {
        const url = new URL(path, 'http://aws-qwik.local');
        if (url.pathname.includes('.', url.pathname.lastIndexOf('/'))) {
          return path;
        }
        if (!url.pathname.endsWith('/')) {
          return url.pathname + '/' + url.search;
        }
      }
      return path;
    };

    return qwikApp;
  } catch (err: any) {
    throw new Error(err.message);
  }
}

/**
 * @public
 */
export interface QwikCityAwsLambdaOptions extends ServerRenderOptions {}

/**
 * @public
 */
export interface PlatformAwsLambda extends Object {}
