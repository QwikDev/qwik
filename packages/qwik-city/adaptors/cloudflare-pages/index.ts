import type { QwikCityRequestOptions } from '../request-handler/types';
import { requestHandler } from '../request-handler';
import type { QwikCityPlan } from '@builder.io/qwik-city';
import type { Render } from '@builder.io/qwik/server';

// @builder.io/qwik-city/adaptors/cloudflare-pages

/**
 * @public
 */
export function createServer(render: Render, opts: QwikCityPlanCloudflarePages) {
  async function onRequest({ request, next }: EventPluginContext) {
    try {
      const url = new URL(request.url);

      const requestOpts: QwikCityRequestOptions = {
        ...opts,
        request,
        url,
      };

      const response = await requestHandler(render, requestOpts);
      if (response) {
        return response;
      } else {
        return next();
      }
    } catch (e: any) {
      return new Response(String(e.stack || e), { status: 500 });
    }
  }

  return {
    onRequest,
  };
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
