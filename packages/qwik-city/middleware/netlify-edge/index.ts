import type { Context } from '@netlify/edge-functions';
import type { ServerRenderOptions, ServerRequestEvent } from '../request-handler/types';
import type { RequestHandler } from '@builder.io/qwik-city';
import { requestHandler } from '../request-handler';
import { mergeHeadersCookies } from '../request-handler/cookie';
import { getNotFound } from '@qwik-city-not-found-paths';
import { isStaticPath } from '@qwik-city-static-paths';

// @builder.io/qwik-city/middleware/netlify-edge

/**
 * @alpha
 */
export function createQwikCity(opts: QwikCityNetlifyOptions) {
  async function onRequest(request: Request, context: Context) {
    try {
      const url = new URL(request.url);

      if (isStaticPath(url.pathname) || url.pathname.startsWith('/.netlify')) {
        // known static path, let netlify handle it
        return context.next();
      }

      const serverRequestEv: ServerRequestEvent<Response> = {
        mode: 'server',
        locale: undefined,
        url,
        request,
        getWritableStream: (status, headers, cookies, resolve) => {
          const { readable, writable } = new TransformStream<Uint8Array>();
          const response = new Response(readable, {
            status,
            headers: mergeHeadersCookies(headers, cookies),
          });
          resolve(response);
          return writable;
        },
        platform: context,
      };

      // send request to qwik city request handler
      const handledResponse = await requestHandler(serverRequestEv, opts);
      if (handledResponse) {
        const response = await handledResponse.response;
        if (response) {
          return response;
        }
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
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Error': 'netlify-edge' },
      });
    }
  }

  return onRequest;
}

/**
 * @alpha
 */
export interface QwikCityNetlifyOptions extends ServerRenderOptions {}

/**
 * @alpha
 */
export interface EventPluginContext extends Context {}

/**
 * @alpha
 */
export type RequestHandlerNetlify = RequestHandler<Omit<Context, 'next' | 'cookies'>>;
