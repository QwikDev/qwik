import type { QwikCityRequestContext } from '../request-handler/types';
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
