import type { QwikCityHandlerOptions, QwikCityRequestContext } from '../request-handler/types';
import type { RequestHandler } from '@builder.io/qwik-city';
import { requestHandler } from '../request-handler';
import { mergeHeadersCookies } from '../request-handler/cookie';
import { getNotFound } from '@qwik-city-not-found-paths';
import { isStaticPath } from '@qwik-city-static-paths';

// @builder.io/qwik-city/middleware/cloudflare-pages

/**
 * @alpha
 */
export function createQwikCity(opts: QwikCityCloudflarePagesOptions) {
  async function onRequest({ request, env, waitUntil, next }: EventPluginContext) {
    try {
      const url = new URL(request.url);

      if (isStaticPath(url.pathname)) {
        // known static path, let cloudflare handle it
        return next();
      }

      // https://developers.cloudflare.com/workers/runtime-apis/cache/
      const useCache =
        url.hostname !== '127.0.0.1' &&
        url.hostname !== 'localhost' &&
        url.port === '' &&
        request.method === 'GET';
      const cacheKey = new Request(url.href, request);
      const cache = useCache ? await caches.open('custom:qwikcity') : null;
      if (cache) {
        const cachedResponse = await cache.match(cacheKey);
        if (cachedResponse) {
          return cachedResponse;
        }
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

            if (response.ok && cache && response.headers.has('Cache-Control')) {
              // Store the fetched response as cacheKey
              // Use waitUntil so you can return the response without blocking on
              // writing to cache
              waitUntil(cache.put(cacheKey, response.clone()));
            }
          });
        },
        platform: env,
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
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Error': 'cloudflare-pages' },
      });
    }
  }

  return onRequest;
}

/**
 * @alpha
 */
export interface QwikCityCloudflarePagesOptions extends QwikCityHandlerOptions {}

/**
 * @alpha
 */
export interface EventPluginContext {
  request: Request;
  waitUntil: (promise: Promise<any>) => void;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
  env: Record<string, any>;
}

/**
 * @alpha
 */
export type RequestHandlerCloudflarePages<T = unknown> = RequestHandler<
  T,
  { env: EventPluginContext['env'] }
>;
