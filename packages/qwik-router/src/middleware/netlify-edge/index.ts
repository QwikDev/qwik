import type { Context } from '@netlify/edge-functions';
import type {
  ServerRenderOptions,
  ServerRequestEvent,
} from '@qwik.dev/router/middleware/request-handler';

import { setServerPlatform } from '@qwik.dev/core/server';
import {
  getNotFound,
  isStaticPath,
  mergeHeadersCookies,
  requestHandler,
} from '@qwik.dev/router/middleware/request-handler';

// @qwik.dev/router/middleware/netlify-edge

declare const Deno: any;
/** @public */
export function createQwikRouter(opts: QwikRouterNetlifyOptions) {
  if (opts.qwikCityPlan && !opts.qwikRouterConfig) {
    console.warn('qwikCityPlan is deprecated. Simply remove it.');
    opts.qwikRouterConfig = opts.qwikCityPlan;
  }
  if (opts.manifest) {
    setServerPlatform(opts.manifest);
  }
  async function onNetlifyEdgeRequest(request: Request, context: Context) {
    try {
      const url = new URL(request.url);

      if (isStaticPath(request.method, url) || url.pathname.startsWith('/.netlify')) {
        // known static path, let netlify handle it
        return context.next();
      }

      const serverRequestEv: ServerRequestEvent<Response> = {
        mode: 'server',
        locale: undefined,
        url,
        env: Deno.env,
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
        getClientConn: () => {
          return {
            ip: context.ip,
            country: context.geo.country?.code,
          };
        },
        platform: context,
      };

      // send request to qwik router request handler
      const handledResponse = await requestHandler(serverRequestEv, opts);
      if (handledResponse) {
        handledResponse.completion.then((v) => {
          if (v) {
            console.error(v);
          }
        });
        const response = await handledResponse.response;
        if (response) {
          return response;
        }
      }

      // qwik router did not have a route for this request
      // response with 404 for this pathname

      // In the development server, we replace the getNotFound function
      // For static paths, we assign a static "Not Found" message.
      // This ensures consistency between development and production environments for specific URLs.
      const notFoundHtml =
        !request.headers.get('accept')?.includes('text/html') ||
        isStaticPath(request.method || 'GET', url)
          ? 'Not Found'
          : getNotFound(url.pathname);
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

  return onNetlifyEdgeRequest;
}

/**
 * @deprecated Use `createQwikRouter` instead. Will be removed in V3
 * @public
 */
export const createQwikCity = createQwikRouter;

/** @public */
export interface QwikRouterNetlifyOptions extends ServerRenderOptions {}

/**
 * @deprecated Use `QwikRouterNetlifyOptions` instead. Will be removed in V3
 * @public
 */
export type QwikCityNetlifyOptions = QwikRouterNetlifyOptions;

/** @public */
export interface PlatformNetlify extends Partial<Omit<Context, 'next' | 'cookies'>> {}
