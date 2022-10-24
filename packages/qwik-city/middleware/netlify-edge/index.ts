import type { Context } from '@netlify/edge-functions';
import type { QwikCityHandlerOptions, QwikCityRequestContext } from '../request-handler/types';
import { notFoundHandler, requestHandler } from '../request-handler';
import type { Render } from '@builder.io/qwik/server';
import type { RenderOptions } from '@builder.io/qwik';
import qwikCityPlan from '@qwik-city-plan';
import type { RequestHandler } from '~qwik-city-runtime';

// @builder.io/qwik-city/middleware/netlify-edge

/**
 * @alpha
 */
export function createQwikCity(opts: QwikCityNetlifyOptions) {
  async function onRequest(request: Request, context: Context) {
    try {
      const requestCtx: QwikCityRequestContext<Response> = {
        url: new URL(request.url),
        request,
        response: (status, headers, body) => {
          return new Promise<Response>((resolve) => {
            let flushedHeaders = false;
            const { readable, writable } = new TransformStream();
            const writer = writable.getWriter();
            const response = new Response(readable, { status, headers });

            body({
              write: (chunk) => {
                if (!flushedHeaders) {
                  flushedHeaders = true;
                  resolve(response);
                }
                if (typeof chunk === 'string') {
                  const encoder = new TextEncoder();
                  writer.write(encoder.encode(chunk));
                } else {
                  writer.write(chunk);
                }
              },
            }).finally(() => {
              if (!flushedHeaders) {
                flushedHeaders = true;
                resolve(response);
              }
              writer.close();
            });
          });
        },
        platform: context,
      };

      // send request to qwik city request handler
      const handledResponse = await requestHandler<Response>(requestCtx, opts);
      if (handledResponse) {
        return handledResponse;
      }

      // qwik city did not have a route for this request
      // respond with qwik city's 404 handler
      const notFoundResponse = await notFoundHandler<Response>(requestCtx);
      return notFoundResponse;
    } catch (e: any) {
      console.error(e);
      return new Response(String(e || 'Error'), {
        status: 500,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  }

  return onRequest;
}

/**
 * @alpha
 */
export interface QwikCityNetlifyOptions extends QwikCityHandlerOptions {}

/**
 * @alpha
 */
export interface EventPluginContext extends Context {}

/**
 * @alpha
 * @deprecated Please use `createQwikCity()` instead.
 *
 * Example:
 *
 * ```ts
 * import { createQwikCity } from '@builder.io/qwik-city/middleware/netlify-edge';
 * import qwikCityPlan from '@qwik-city-plan';
 * import render from './entry.ssr';
 *
 * export default createQwikCity({ render, qwikCityPlan });
 * ```
 */
export function qwikCity(render: Render, opts?: RenderOptions) {
  return createQwikCity({ render, qwikCityPlan, ...opts });
}

/**
 * @alpha
 */
export type RequestHandlerNetlify<T = unknown> = RequestHandler<T, Omit<Context, 'next'>>;
