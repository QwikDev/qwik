import { createQwikRouter as createQwikRouterNode } from '@qwik.dev/router/middleware/node';

import type { ServerRenderOptions } from '@qwik.dev/router/middleware/request-handler';

/** @public */
export function createQwikRouter(opts: QwikRouterFirebaseOptions) {
  if (opts.qwikCityPlan && !opts.qwikRouterConfig) {
    console.warn('qwikCityPlan is deprecated. Simply remove it.');
    opts.qwikRouterConfig = opts.qwikCityPlan;
  }
  const { staticFile, notFound, router } = createQwikRouterNode({
    render: opts.render,
    manifest: opts.manifest,
    qwikRouterConfig: opts.qwikRouterConfig,
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

/**
 * @deprecated Use `createQwikRouter` instead. Will be removed in V3
 * @public
 */
export const createQwikCity = createQwikRouter;

/** @public */
export interface QwikRouterFirebaseOptions extends ServerRenderOptions {}

/**
 * @deprecated Use `QwikRouterFirebaseOptions` instead. Will be removed in V3
 * @public
 */
export type QwikCityFirebaseOptions = QwikRouterFirebaseOptions;

/** @public */
export interface PlatformFirebase extends Object {}
