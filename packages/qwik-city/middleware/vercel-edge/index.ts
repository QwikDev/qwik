import type { QwikCityHandlerOptions, QwikCityRequestContext } from '../request-handler/types';
import { requestHandler } from '../request-handler';
import { mergeHeadersCookies } from '../request-handler/cookie';
import { getNotFound } from '@qwik-city-not-found-paths';
import { isStaticPath } from '@qwik-city-static-paths';

// @builder.io/qwik-city/middleware/vercel-edge

/**
 * @alpha
 */
export function createQwikCity(opts: QwikCityVercelEdgeOptions) {
  async function onRequest(request: Request) {
    try {
      const url = new URL(request.url);

      if (isStaticPath(url.pathname)) {
        // known static path, let vercel handle it
        return new Response(null, {
          headers: {
            'x-middleware-next': '1',
          },
        });
      }

      const requestCtx: QwikCityRequestContext<Response> = {
        mode: 'server',
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
      const handledResponse = await requestHandler<Response>(requestCtx, opts);
      if (handledResponse) {
        return handledResponse;
      }

      // qwik city did not have a route for this request
      // response with 404 for this pathname
      const notFoundHtml = getNotFound(url.pathname);
      return new Response(notFoundHtml, {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Not-Found': url.pathname },
      });
    } catch (e: any) {
      console.error(e);
      return new Response(String(e || 'Error'), {
        status: 500,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Error': 'vercel-edge' },
      });
    }
  }

  return onRequest;
}

/**
 * @alpha
 */
export interface QwikCityVercelEdgeOptions extends QwikCityHandlerOptions {}
