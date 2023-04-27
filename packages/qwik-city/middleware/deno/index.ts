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
import { MIME_TYPES } from '../request-handler/mime-types';
import { extname, join } from 'https://deno.land/std/path/mod.ts';

// @builder.io/qwik-city/middleware/deno

/**
 * @public
 */
export function createQwikCity(opts: QwikCityDenoOptions) {
  const qwikSerializer = {
    _deserializeData,
    _serializeData,
    _verifySerializable,
  };
  if (opts.manifest) {
    setServerPlatform(opts.manifest);
  }

  const staticFolder = opts.static?.root ?? join(import.meta.url, '..', '..', 'dist');

  async function router(request: Request) {
    try {
      const url = new URL(request.url);

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
        platform: {
          ssr: true,
          deno: Deno.version.deno,
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
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Error': 'deno-server' },
      });
    }
  }

  const notFound = async (request: Request) => {
    try {
      const url = new URL(request.url);
      const notFoundHtml = getNotFound(url.pathname);
      return new Response(notFoundHtml, {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Not-Found': url.pathname },
      });
    } catch (e) {
      console.error(e);
      return new Response(String(e || 'Error'), {
        status: 500,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Error': 'deno-server' },
      });
    }
  };

  const staticFile = async (request: Request) => {
    try {
      const url = new URL(request.url);

      if (isStaticPath(request.method || 'GET', url)) {
        const filePath = join(staticFolder, url.pathname);
        const ext = extname(url.pathname).replace(/^\./, '');

        const content = await Deno.readTextFile(filePath);

        return new Response(content, {
          status: 200,
          headers: {
            'content-type': MIME_TYPES[ext] || 'text/plain; charset=utf-8',
            'Cache-Control': opts.static?.cacheControl || 'max-age=3600',
          },
        });
      }

      return null;
    } catch (e) {
      console.error(e);
      return new Response(String(e || 'Error'), {
        status: 500,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Error': 'deno-server' },
      });
    }
  };

  return {
    router,
    notFound,
    staticFile,
  };
}

/**
 * @public
 */
export interface QwikCityDenoOptions extends ServerRenderOptions {
  /** Options for serving static files */
  static?: {
    /** The root folder for statics files. Defaults to /dist */
    root?: string;
    /** Set the Cache-Control header for all static files */
    cacheControl?: string;
  };
}
