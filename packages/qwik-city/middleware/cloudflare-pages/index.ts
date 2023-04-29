import type {
  ServerRenderOptions,
  ServerRequestEvent,
} from '@builder.io/qwik-city/middleware/request-handler';
import {
  mergeHeadersCookies,
  requestHandler,
} from '@builder.io/qwik-city/middleware/request-handler';
import { getNotFound } from '@qwik-city-not-found-paths';
import { isStaticPath } from '@qwik-city-static-paths';
import { _deserializeData, _serializeData, _verifySerializable } from '@builder.io/qwik';
import { setServerPlatform } from '@builder.io/qwik/server';

// @builder.io/qwik-city/middleware/cloudflare-pages

/**
 * @public
 */
export function createQwikCity(opts: QwikCityCloudflarePagesOptions) {
  (globalThis as any).TextEncoderStream = TextEncoderStream;
  const qwikSerializer = {
    _deserializeData,
    _serializeData,
    _verifySerializable,
  };
  if (opts.manifest) {
    setServerPlatform(opts.manifest);
  }
  async function onCloudflarePagesRequest(eventPluginContext: EventPluginContext) {
    try {
      const { request, env, waitUntil, next } = eventPluginContext;
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
        platform: {
          request,
          env,
          ctx: { waitUntil },
          next,
        },
      };

      // send request to qwik city request handler
      const handledResponse = await requestHandler(serverRequestEv, opts, qwikSerializer);
      if (handledResponse) {
        handledResponse.completion.then((v) => {
          if (v) {
            console.error(v);
          }
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
 * @public
 */
export interface QwikCityCloudflarePagesOptions extends ServerRenderOptions {}

/**
 * @public
 */
export interface EventPluginContext {
  request: Request;
  waitUntil: (promise: Promise<any>) => void;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
  env: Record<string, any>;
}

/**
 * @public
 */
export interface PlatformCloudflarePages {
  request: EventPluginContext['request'];
  ctx: {
    waitUntil: EventPluginContext['waitUntil'];
  };
  env: EventPluginContext['env'];
}

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
