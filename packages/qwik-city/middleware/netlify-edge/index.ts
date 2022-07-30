import type { QwikCityRequestOptions, QwikCityRequestContext } from '../request-handler/types';
import { notFoundHandler, requestHandler } from '../request-handler';
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
export interface QwikCityNetlifyOptions extends QwikCityRequestOptions {}

/**
 * @public
 */
export interface EventPluginContext {
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
}
