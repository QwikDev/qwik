import type { QwikCityRequestOptions } from '../request-handler/types';
import { requestHandler } from '../request-handler';
import type { QwikCityPlan } from '@builder.io/qwik-city';
import type { Render } from '@builder.io/qwik/server';

// @builder.io/qwik-city/middleware/netlify-edge

/**
 * @public
 */
export function qwikCity(render: Render, opts: QwikCityPlanNetlifyEdge) {
  async function onRequest(request: Request, { next }: EventPluginContext) {
    try {
      const requestOpts: QwikCityRequestOptions = {
        ...opts,
        request,
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

  return onRequest;
}

/**
 * @public
 */
export interface QwikCityPlanNetlifyEdge extends QwikCityPlan {}

/**
 * @public
 */
export interface EventPluginContext {
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
}
