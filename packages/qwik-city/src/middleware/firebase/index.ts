import { createQwikCity as createQwikCityNode } from '@builder.io/qwik-city/middleware/node';

import type { ServerRenderOptions } from '@builder.io/qwik-city/middleware/request-handler';

/** @public */
export function createQwikCity(opts: QwikCityFirebaseOptions) {
  const { staticFile, notFound, router } = createQwikCityNode({
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

  const qwikApp = (req: any, res: any) => {
    return staticFile(req, res, () => {
      router(req, res, () => notFound(req, res, () => {}));
    });
  };

  return qwikApp;
}

/** @public */
export interface QwikCityFirebaseOptions extends ServerRenderOptions {}

/** @public */
export interface PlatformFirebase extends Object {}
