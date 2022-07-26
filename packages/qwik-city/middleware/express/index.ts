import type { QwikCityRequestContext } from '../request-handler/types';
import { requestHandler } from '../request-handler';
import { patchGlobalFetch } from '../request-handler/node-fetch';
import express from 'express';
import { join, resolve } from 'path';
import type { QwikCityPlan } from '@builder.io/qwik-city';
import type { Render } from '@builder.io/qwik/server';
import { fromNodeHttp } from './utils';

// @builder.io/qwik-city/middleware/express

/**
 * @public
 */
export function qwikCity(render: Render, opts: QwikCityPlanExpress) {
  patchGlobalFetch();

  const router = express.Router();

  let staticDir = opts.staticDir;
  if (typeof staticDir === 'string') {
    staticDir = resolve(staticDir);

    let buildDir = opts.buildDir;
    if (typeof buildDir === 'string') {
      buildDir = resolve(buildDir);
    } else {
      buildDir = join(staticDir, 'build');
    }

    router.use(`/build`, express.static(buildDir, { immutable: true, maxAge: '1y', index: false }));

    router.use(express.static(staticDir, { index: false }));
  }

  router.use(async (nodeReq, nodeRes, next) => {
    try {
      const url = new URL(nodeReq.url, `${nodeReq.protocol}://${nodeReq.headers.host}`);
      const serverRequestEv = fromNodeHttp(url, nodeReq, nodeRes);

      const requestCtx: QwikCityRequestContext = {
        ...opts,
        ...serverRequestEv,
        render,
        next,
      };

      await requestHandler(requestCtx);
    } catch (e) {
      next(e);
    }
  });

  return router;
}

/**
 * @public
 */
export interface QwikCityPlanExpress extends QwikCityPlan {
  staticDir?: string;
  buildDir?: string;
}
