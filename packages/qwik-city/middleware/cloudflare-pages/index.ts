import type { QwikCityHandlerOptions, QwikCityRequestContext } from '../request-handler/types';
import { notFoundHandler, requestHandler } from '../request-handler';
import type { RenderOptions } from '@builder.io/qwik';
import type { Render } from '@builder.io/qwik/server';
import qwikCityPlan from '@qwik-city-plan';
import type { RequestHandler } from '~qwik-city-runtime';

// @builder.io/qwik-city/middleware/cloudflare-pages

/**
 * @alpha
 */
export function createQwikCity(opts: QwikCityCloudflarePagesOptions) {
  async function onRequest({ request, next, env, waitUntil }: EventPluginContext) {
    try {
      const url = new URL(request.url);

      // https://developers.cloudflare.com/workers/runtime-apis/cache/
      const useCache =
        url.hostname !== '127.0.0.1' &&
        url.hostname !== 'localhost' &&
        url.port === '' &&
        request.method === 'GET';
      const cacheKey = new Request(url.href, request);
      const cache = useCache ? await caches.open('custom:qwikcity') : null;
      if (cache) {
        const cachedResponse = await cache.match(cacheKey);
        if (cachedResponse) {
          return cachedResponse;
        }
      }

      const requestCtx: QwikCityRequestContext<Response> = {
        url,
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

            if (response.ok && cache && response.headers.has('Cache-Control')) {
              // Store the fetched response as cacheKey
              // Use waitUntil so you can return the response without blocking on
              // writing to cache
              waitUntil(cache.put(cacheKey, response.clone()));
            }
          });
        },
        platform: env,
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
export interface QwikCityCloudflarePagesOptions extends QwikCityHandlerOptions {}

/**
 * @alpha
 */
export interface EventPluginContext {
  request: Request;
  waitUntil: (promise: Promise<any>) => void;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
  env: Record<string, any>;
}

/**
 * @alpha
 * @deprecated Please use `createQwikCity()` instead.
 *
 * Example:
 *
 * ```ts
 * import { createQwikCity } from '@builder.io/qwik-city/middleware/cloudflare-pages';
 * import qwikCityPlan from '@qwik-city-plan';
 * import render from './entry.ssr';
 *
 * export const onRequest = createQwikCity({ render, qwikCityPlan });
 * ```
 */
export function qwikCity(render: Render, opts?: RenderOptions) {
  return createQwikCity({ render, qwikCityPlan, ...opts });
}

/**
 * @alpha
 */
export type RequestHandlerCloudflarePages<T = unknown> = RequestHandler<
  T,
  { env: EventPluginContext['env'] }
>;
