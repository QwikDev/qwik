import type {
  ServerRenderOptions,
  ServerRequestEvent,
} from '@builder.io/qwik-city/middleware/request-handler';
import type { RequestHandler } from '@builder.io/qwik-city';
import {
  mergeHeadersCookies,
  requestHandler,
} from '@builder.io/qwik-city/middleware/request-handler';
import { getNotFound } from '@qwik-city-not-found-paths';
import { isStaticPath } from '@qwik-city-static-paths';

// @builder.io/qwik-city/middleware/cloudflare-pages

/**
 * @alpha
 */
export function createQwikCity(opts: QwikCityCloudflarePagesOptions) {
  (globalThis as any).TextEncoderStream = TextEncoderStream;

  async function onCloudflarePagesRequest({ request, env, waitUntil, next }: EventPluginContext) {
    try {
      const url = new URL(request.url);

      if (isStaticPath(request.method, url)) {
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

      const serverRequestEv: ServerRequestEvent<Response> = {
        mode: 'server',
        locale: undefined,
        url,
        request,
        env: {
          get(key) {
            return env[key];
          },
        },
        getWritableStream: (status, headers, cookies, resolve) => {
          const { readable, writable } = new TransformStream<Uint8Array>();
          const response = new Response(readable, {
            status,
            headers: mergeHeadersCookies(headers, cookies),
          });
          resolve(response);
          return writable;
        },
        platform: env,
      };

      // send request to qwik city request handler
      const handledResponse = await requestHandler(serverRequestEv, opts);
      if (handledResponse) {
        handledResponse.completion.then((v) => {
          console.error(v);
        });
        const response = await handledResponse.response;
        if (response) {
          if (response.ok && cache && response.headers.has('Cache-Control')) {
            // Store the fetched response as cacheKey
            // Use waitUntil so you can return the response without blocking on
            // writing to cache
            waitUntil(cache.put(cacheKey, response.clone()));
          }
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
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Error': 'cloudflare-pages' },
      });
    }
  }

  return onCloudflarePagesRequest;
}

/**
 * @alpha
 */
export interface QwikCityCloudflarePagesOptions extends ServerRenderOptions {}

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
export type RequestHandlerCloudflarePages = RequestHandler<{ env: EventPluginContext['env'] }>;

const resolved = Promise.resolve();

class TextEncoderStream {
  // minimal polyfill implementation of TextEncoderStream
  // since Cloudflare Pages doesn't support readable.pipeTo()
  _writer: any;
  readable: any;
  writable: any;

  constructor() {
    this._writer = null;
    this.readable = {
      pipeTo: (writableStream: any) => {
        this._writer = writableStream.getWriter();
      },
    };
    this.writable = {
      getWriter: () => {
        if (!this._writer) {
          throw new Error('No writable stream');
        }
        const encoder = new TextEncoder();
        return {
          write: async (chunk: any) => {
            if (chunk != null) {
              await this._writer.write(encoder.encode(chunk));
            }
          },
          close: () => this._writer.close(),
          ready: resolved,
        };
      },
    };
  }
}
