import type { QwikCityRequestOptions } from '../request-handler/types';
import { requestHandler } from '../request-handler';
import type { QwikCityPlan } from '@builder.io/qwik-city';
import type { Render } from '@builder.io/qwik/server';

// @builder.io/qwik-city/middleware/cloudflare-pages

/**
 * @public
 */
export function qwikCity(render: Render, opts: QwikCityPlanCloudflarePages) {
  async function onRequest({ request, next, waitUntil }: EventPluginContext) {
    try {
      // early return from cache
      const cache = await caches.open('custom:qwikcity');
      const cachedResponse = await cache.match(request);
      if (cachedResponse) {
        return cachedResponse;
      }

      const requestOpts: QwikCityRequestOptions = {
        ...opts,
        request,
      };

      const response = await requestHandler(render, requestOpts);
      if (response) {
        if (response.ok) {
          const cacheControl = response.headers.get('Cache-Control') || '';
          if (!cacheControl.includes('no-store')) {
            waitUntil(cache.put(request, response.clone()));
          }
        }
        return response;
      } else {
        return next();
      }
    } catch (e: any) {
      return new Response(String(e.stack || e), { status: 500 });
    }
  }

  return onRequest;
}

/**
 * @public
 */
export interface QwikCityPlanCloudflarePages extends QwikCityPlan {}

/**
 * @public
 */
export interface EventPluginContext {
  request: Request;
  waitUntil: (promise: Promise<any>) => void;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
}
