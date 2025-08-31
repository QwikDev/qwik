import { setServerPlatform } from '@qwik.dev/core/server';
import type {
  ClientConn,
  ServerRenderOptions,
  ServerRequestEvent,
} from '@qwik.dev/router/middleware/request-handler';
import {
  getNotFound,
  isStaticPath,
  mergeHeadersCookies,
  requestHandler,
} from '@qwik.dev/router/middleware/request-handler';
import { MIME_TYPES } from '../request-handler/mime-types';
// @ts-ignore
import { extname, fromFileUrl, join } from 'https://deno.land/std/path/mod.ts';

// @qwik.dev/router/middleware/deno

/** @public */
export interface NetAddr {
  transport: 'tcp' | 'udp';
  hostname: string;
  port: number;
}

/** @public */
export interface ServeHandlerInfo {
  remoteAddr: NetAddr;
}

/** @public */
export function createQwikRouter(opts: QwikRouterDenoOptions) {
  if (opts.qwikCityPlan && !opts.qwikRouterConfig) {
    console.warn('qwikCityPlan is deprecated. Simply remove it.');
    opts.qwikRouterConfig = opts.qwikCityPlan;
  }
  if (opts.manifest) {
    setServerPlatform(opts.manifest);
  }

  const staticFolder = opts.static?.root ?? join(fromFileUrl(import.meta.url), '..', '..', 'dist');

  async function router(request: Request, info: ServeHandlerInfo) {
    try {
      const url = new URL(request.url);

      const serverRequestEv: ServerRequestEvent<Response> = {
        mode: 'server',
        locale: undefined,
        url,
        // @ts-ignore
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
        getClientConn: () => {
          return opts.getClientConn
            ? opts.getClientConn(request, info)
            : {
                ip: info.remoteAddr.hostname,
              };
        },
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
    } catch (e) {
      console.error(e);
      return new Response(String(e || 'Error'), {
        status: 500,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Error': 'deno-server' },
      });
    }
  };

  const openStaticFile = async (url: URL) => {
    const pathname = url.pathname;
    const fileName = pathname.slice(url.pathname.lastIndexOf('/'));
    let filePath: string;
    if (fileName.includes('.')) {
      filePath = join(staticFolder, pathname);
    } else if (!globalThis.__NO_TRAILING_SLASH__) {
      filePath = join(staticFolder, pathname + 'index.html');
    } else {
      filePath = join(staticFolder, pathname, 'index.html');
    }
    return {
      filePath,
      // @ts-ignore
      content: await Deno.open(filePath, { read: true }),
    };
  };

  const staticFile = async (request: Request) => {
    try {
      const url = new URL(request.url);

      if (isStaticPath(request.method || 'GET', url)) {
        const { filePath, content } = await openStaticFile(url);
        const ext = extname(filePath).replace(/^\./, '');

        return new Response(content.readable, {
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
 * @deprecated Use `createQwikRouter` instead. Will be removed in V3
 * @public
 */
export const createQwikCity = createQwikRouter;

/** @public */
export interface QwikRouterDenoOptions extends ServerRenderOptions {
  /** Options for serving static files */
  static?: {
    /** The root folder for statics files. Defaults to /dist */
    root?: string;
    /** Set the Cache-Control header for all static files */
    cacheControl?: string;
  };
  getClientConn?: (request: Request, info: ServeHandlerInfo) => ClientConn;
}

/**
 * @deprecated Use `QwikRouterDenoOptions` instead. Will be removed in V3
 * @public
 */
export type QwikCityDenoOptions = QwikRouterDenoOptions;
