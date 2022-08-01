import type { QwikCityRequestOptions, QwikCityRequestContext } from '../request-handler/types';
import { notFoundHandler, requestHandler } from '../request-handler';
import type { Render } from '@builder.io/qwik/server';

// @builder.io/qwik-city/middleware/cloudflare-pages

/**
 * @public
 */
export function qwikCity(render: Render, opts?: QwikCityCloudflarePagesOptions) {
  async function onRequest({ request, next }: EventPluginContext) {
    try {
      // early return from cache
      const cache = await caches.open('custom:qwikcity');
      const cachedResponse = await cache.match(request);
      if (cachedResponse) {
        return cachedResponse;
      }

      const requestCtx: QwikCityRequestContext<Response> = {
        url: new URL(request.url),
        request,
        response: (status, headers, body) => {
          const { readable, writable } = new TransformStream();
          const writer = writable.getWriter();

          body({
            write: async (chunk) => {
              const encoder = new TextEncoder();
              const encoded = encoder.encode(chunk);
              await writer.write(encoded);
            },
          }).finally(() => {
            writer.close();
          });

          return new Response(readable, { status, headers });
        },
      };

      const handledResponse = await requestHandler<Response>(requestCtx, render, opts);
      if (handledResponse) {
        return handledResponse;
      }

      const nextResponse = await next();
      if (nextResponse.status === 404) {
        const notFoundResponse = await notFoundHandler<Response>(requestCtx);
        return notFoundResponse;
      }

      return nextResponse;
    } catch (e: any) {
      return new Response(String(e || 'Error'), {
        status: 500,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  }

  return onRequest;
}

/**
 * @public
 */
export interface QwikCityCloudflarePagesOptions extends QwikCityRequestOptions {}

/**
 * @public
 */
export interface EventPluginContext {
  request: Request;
  waitUntil: (promise: Promise<any>) => void;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
}
