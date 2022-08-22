import type { QwikCityRequestOptions, QwikCityRequestContext } from '../request-handler/types';
import { notFoundHandler, requestHandler } from '../request-handler';
import type { Render } from '@builder.io/qwik/server';

// @builder.io/qwik-city/middleware/netlify-edge

/**
 * @alpha
 */
export function qwikCity(render: Render, opts?: QwikCityNetlifyOptions) {
  async function onRequest(request: Request, { next }: EventPluginContext) {
    try {
      const requestCtx: QwikCityRequestContext<Response> = {
        url: new URL(request.url),
        request,
        response: (status, headers, body) => {
          return new Promise<Response>((resolve) => {
            let flushedHeaders = false;
            const { readable, writable } = new TransformStream();
            const writer = writable.getWriter();
            const response = new Response(readable, { status, headers });

            body({
              write: (chunk) => {
                if (!flushedHeaders) {
                  flushedHeaders = true;
                  resolve(response);
                }
                if (typeof chunk === 'string') {
                  const encoder = new TextEncoder();
                  writer.write(encoder.encode(chunk));
                } else {
                  writer.write(chunk);
                }
              },
            }).finally(() => {
              if (!flushedHeaders) {
                flushedHeaders = true;
                resolve(response);
              }
              writer.close();
            });
          });
        },
      };

      // check if the next middleware is able to handle this request
      // useful if the request is for a static asset but app uses a catchall route
      const nextResponse = await next();

      if (nextResponse.status === 404) {
        // next middleware unable to handle request
        // send request to qwik city request handler
        const handledResponse = await requestHandler<Response>(requestCtx, render, opts);
        if (handledResponse) {
          return handledResponse;
        }

        // qwik city did not have a route for this request
        // respond with qwik city's 404 handler
        const notFoundResponse = await notFoundHandler<Response>(requestCtx);
        return notFoundResponse;
      }

      // use the next middleware's response
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
 * @alpha
 */
export interface QwikCityNetlifyOptions extends QwikCityRequestOptions {}

/**
 * @alpha
 */
export interface EventPluginContext {
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
}
