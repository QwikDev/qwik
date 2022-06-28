import type { QwikCityRequestOptions, RenderFunction } from '../types';
import { requestHandler } from 'packages/qwik-city/adaptor';
import type { QwikCityPlan } from '@builder.io/qwik-city';

// @builder.io/qwik-city/cloudflare-pages

export function createServer(renderFn: RenderFunction, opts: QwikCityPlanCloudflarePages) {
  async function onRequest({ request, next }: EventPluginContext) {
    try {
      const url = new URL(request.url);

      const requestOpts: QwikCityRequestOptions = {
        ...opts,
        request,
        url,
      };

      const response = await requestHandler(renderFn, requestOpts);
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

export interface QwikCityPlanCloudflarePages extends QwikCityPlan {}

interface EventPluginContext {
  request: Request;
  waitUntil: (promise: Promise<any>) => void;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
}
