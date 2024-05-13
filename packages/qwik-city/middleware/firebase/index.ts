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
      // Return a cheaper 404 for static files
      if (
        req.method === 'GET' &&
        /\.(js|css|jpg|jpeg|png|webp|avif|gif|svg)$/.test(req.url ?? '')
      ) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('Not Found');
        return;
      }
      router(req, res, () => notFound(req, res, () => {}));
    });
  };

  return qwikApp;
}

/** @public */
export interface QwikCityFirebaseOptions extends ServerRenderOptions {}

/** @public */
export interface PlatformFirebase extends Object {}
