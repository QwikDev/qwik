import type { QwikCityRequestOptions } from '../request-handler/types';
import { requestHandler } from '../request-handler';
import { patchGlobalFetch } from '../request-handler/node-fetch';
import express from 'express';
import { join } from 'path';
import type { QwikCityPlan } from '@builder.io/qwik-city';
import type { Render } from '@builder.io/qwik/server';
import { convertNodeRequest, convertNodeResponse } from './utils';

// @builder.io/qwik-city/middleware/express

/**
 * @public
 */
export function qwikCity(render: Render, opts: QwikCityPlanExpress) {
  patchGlobalFetch();

  const router = express.Router();

  const staticDir = opts.staticDir;

  const buildDir = opts.buildDir || join(staticDir, 'build');

  router.use(`/build`, express.static(buildDir, { immutable: true, maxAge: '1y', index: false }));

  router.use(express.static(staticDir, { index: false }));

  router.use(async (nodeReq, nodeRes, next) => {
    try {
      const url = new URL(nodeReq.url, `${nodeReq.protocol}://${nodeReq.headers.host}`);
      const request = await convertNodeRequest(url, nodeReq);

      const requestOpts: QwikCityRequestOptions = {
        ...opts,
        request,
      };

      const response = await requestHandler(render, requestOpts);
      if (response) {
        convertNodeResponse(response, nodeRes);
      } else {
        next();
      }
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
  staticDir: string;
  buildDir?: string;
}
