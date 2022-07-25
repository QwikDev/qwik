import type { QwikCityRequestContext } from '../request-handler/types';
import { requestHandler } from '../request-handler';
import type { QwikCityPlan } from '@builder.io/qwik-city';
import type { Render } from '@builder.io/qwik/server';

// @builder.io/qwik-city/middleware/cloudflare-pages

/**
 * @public
 */
export function qwikCity(render: Render, opts: QwikCityPlanCloudflarePages) {
  async function onRequest({ request, next }: EventPluginContext) {
    try {
      // early return from cache
      const cache = await caches.open('custom:qwikcity');
      const cachedResponse = await cache.match(request);
      if (cachedResponse) {
        return cachedResponse;
      }

      const responseInit: ResponseInit = {
        status: 200,
        headers: new Headers(),
      };

      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();

      const requestCtx: QwikCityRequestContext = {
        ...opts,
        request,
        response: {
          status(code) {
            responseInit.status = code;
          },
          get statusCode() {
            return responseInit.status as number;
          },
          headers: responseInit.headers as Headers,
          redirect(url, code) {
            responseInit.status = typeof code === 'number' ? code : 307;
            responseInit.headers = {
              Location: url,
            };
            requestCtx.response.handled = true;
          },
          write: writer.write,
          body: undefined,
          handled: false,
        },
        url: new URL(request.url),
        render,
      };

      await requestHandler(requestCtx);

      if (requestCtx.response.handled) {
        return new Response(readable, responseInit);
      }

      return next();
    } catch (e: any) {
      return new Response(String(e ? e.stack || e : 'Error'), {
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
export interface QwikCityPlanCloudflarePages extends QwikCityPlan {}

/**
 * @public
 */
export interface EventPluginContext {
  request: Request;
  waitUntil: (promise: Promise<any>) => void;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
}
