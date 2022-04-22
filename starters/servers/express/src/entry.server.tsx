import { renderToString, RenderToStringOptions } from '@builder.io/qwik/server';
import type { Request, Response, NextFunction } from 'express';
import { Root } from './root';

/**
 * Qwik server-side render function.
 */
export function render(opts: RenderToStringOptions) {
  return renderToString(<Root />, opts);
}

/**
 * Qwik middleware to be used by an express server.
 */
export async function qwikMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await render({
      url: new URL(`${req.protocol}://${req.hostname}${req.url}`),
      base: '/build/',
    });
    res.send(result.html);
  } catch (e) {
    next(e);
  }
}
