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
import { extname, fromFileUrl, join } from 'https://deno.land/std/path/mod.ts';
import type { ClientInfo } from '../request-handler/types';

// @builder.io/qwik-city/middleware/deno

interface Addr {
  transport: 'tcp' | 'udp';
  hostname: string;
  port: number;
}
interface ConnInfo {
  readonly localAddr: Addr;
  readonly remoteAddr: Addr;
}
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

  const staticFolder = opts.static?.root ?? join(fromFileUrl(import.meta.url), '..', '..', 'dist');

  async function router(request: Request, conn: ConnInfo) {
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
        },
        getClientInfo: () => {
          return opts.getClientInfo
            ? opts.getClientInfo(request, conn)
            : {
                ip: conn.remoteAddr.hostname,
              };
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
      return null;
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

  const readStaticFile = async (url: URL) => {
    const parts = url.pathname.split('/');
    const fileName = parts[parts.length - 1];
    let filePath: string;
    if (fileName.includes('.')) {
      filePath = join(staticFolder, url.pathname);
    } else if (opts.qwikCityPlan.trailingSlash) {
      filePath = join(staticFolder, url.pathname + 'index.html');
    } else {
      filePath = join(staticFolder, url.pathname, 'index.html');
    }
    return {
      filePath,
      content: await Deno.readFile(filePath),
    };
  };

  const staticFile = async (request: Request) => {
    try {
      const url = new URL(request.url);

      if (isStaticPath(request.method || 'GET', url)) {
        const { filePath, content } = await readStaticFile(url);
        const ext = extname(filePath).replace(/^\./, '');

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
  getClientInfo?: (request: Request, conn: ConnInfo) => ClientInfo;
}
