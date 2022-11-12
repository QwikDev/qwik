import type { QwikCityHandlerOptions, QwikCityRequestContext } from '../request-handler/types';
import { notFoundHandler, requestHandler } from '../request-handler';
import { mergeHeadersCookies } from '../request-handler/cookie';

// @builder.io/qwik-city/middleware/vercel-edge

/**
 * @alpha
 */
export function createQwikCity(opts: QwikCityVercelEdgeOptions) {
  async function onRequest(request: Request) {
    try {
      const url = new URL(request.url);

      const requestCtx: QwikCityRequestContext<Response> = {
        locale: undefined,
        url,
        request,
        response: (status, headers, cookies, body) => {
          return new Promise<Response>((resolve) => {
            let flushedHeaders = false;
            const { readable, writable } = new TransformStream();
            const writer = writable.getWriter();

            const response = new Response(readable, {
              status,
              headers: mergeHeadersCookies(headers, cookies),
            });

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
        platform: process.env,
      };

      // send request to qwik city request handler
      const handledResponse = await requestHandler<Response>('server', requestCtx, opts);
      if (handledResponse) {
        return handledResponse;
      }

      // qwik city did not have a route for this request
      // respond with qwik city's 404 handler
      const notFoundResponse = await notFoundHandler<Response>(requestCtx);
      return notFoundResponse;
    } catch (e: any) {
      console.error(e);
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
export interface QwikCityVercelEdgeOptions extends QwikCityHandlerOptions {}
