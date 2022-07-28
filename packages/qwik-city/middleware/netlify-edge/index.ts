import type { QwikCityRequestOptions, QwikCityRequestContext } from '../request-handler/types';
import { requestHandler } from '../request-handler';
import type { Render } from '@builder.io/qwik/server';

// @builder.io/qwik-city/middleware/netlify-edge

/**
 * @public
 */
export function qwikCity(render: Render, opts: QwikCityNetlifyOptions) {
  async function onRequest(request: Request, { next }: EventPluginContext) {
    try {
      const requestCtx: QwikCityRequestContext<Response> = {
        url: new URL(request.url),
        request,
        response: (status, headers, body) => {
          const { readable, writable } = new TransformStream();
          const stream = writable.getWriter();
          body({
            write: (chunk) => stream.write(chunk),
          }).finally(() => {
            stream.close();
          });
          return new Response(readable, { status, headers });
        },
        next,
      };

      const response = await requestHandler<Response>(requestCtx, render, opts);
      return response;
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
export interface QwikCityNetlifyOptions extends QwikCityRequestOptions {}

/**
 * @public
 */
export interface EventPluginContext {
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
}
