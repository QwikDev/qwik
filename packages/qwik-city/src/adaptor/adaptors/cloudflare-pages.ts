import type { QwikCityAdaptorOptions, QwikCityRequestOptions } from '../types';
import { requestHandler } from '@builder.io/qwik-city/adaptor';

// @builder.io/qwik-city/cloudflare-pages

export function createServer(root: any, opts: QwikCityCloudflarePagesOptions) {
  async function onRequest({ request, next }: EventPluginContext) {
    try {
      const url = new URL(request.url);

      const requestOpts: QwikCityRequestOptions = {
        ...opts,
        request,
        url,
      };

      const response = await requestHandler(root, requestOpts);
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

export interface QwikCityCloudflarePagesOptions extends QwikCityAdaptorOptions {}

interface EventPluginContext {
  request: Request;
  waitUntil: (promise: Promise<any>) => void;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
}
