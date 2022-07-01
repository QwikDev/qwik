import type { QwikCityRequestOptions } from '../request-handler/types';
import { requestHandler } from '../request-handler';
import { patchGlobalFetch } from '../request-handler/node-fetch';
import express from 'express';
import { join } from 'path';
import type { QwikCityPlan } from '@builder.io/qwik-city';
import type { Render } from '@builder.io/qwik/server';

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

  router.use(async (req, res, next) => {
    try {
      const url = new URL(req.url, `${req.protocol}://${req.headers.host}`);
      const request = new Request(url.href, {
        method: req.method,
        headers: req.headers as any,
      });

      const requestOpts: QwikCityRequestOptions = {
        ...opts,
        request,
      };

      const response = await requestHandler(render, requestOpts);
      if (response) {
        res.status(response.status);
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.send(response.body);
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
