import type { QwikCityAdaptorOptions, QwikCityRequestOptions, RenderFunction } from '../types';
import { requestHandler } from '@builder.io/qwik-city/adaptor';
import { patchGlobalFetch } from '../fetch';
import express from 'express';
import { join } from 'path';

// @builder.io/qwik-city/express

export function qwikCity(renderFn: RenderFunction, opts: QwikCityExpressOptions) {
  patchGlobalFetch();

  const router = express.Router();

  const staticDir = opts.staticDir || join(__dirname, '..', 'dist');

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
        url,
      };

      const response = await requestHandler(renderFn, requestOpts);
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

export interface QwikCityExpressOptions extends QwikCityAdaptorOptions {
  staticDir?: string;
  buildDir?: string;
}
